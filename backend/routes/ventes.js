const router = require('express').Router();
const db     = require('../config/db');
const auth   = require('../middleware/auth');

// Recalcule le solde global d'un client
async function recalcSoldeClient(client_id) {
  await db.query(
    `UPDATE clients SET solde_global=(SELECT COALESCE(SUM(solde),0) FROM ventes WHERE client_id=?) WHERE id=?`,
    [client_id, client_id]
  );
}

// GET /api/ventes
router.get('/', auth, async (req, res) => {
  try {
    const { date, client_id, statut, date_debut, date_fin } = req.query;
    let sql = `SELECT v.*, c.nom as client_nom, c.zone, c.categorie
               FROM ventes v JOIN clients c ON v.client_id=c.id WHERE 1=1`;
    const p = [];
    if (date)       { sql += ' AND v.date_vente=?'; p.push(date); }
    if (date_debut) { sql += ' AND v.date_vente>=?'; p.push(date_debut); }
    if (date_fin)   { sql += ' AND v.date_vente<=?'; p.push(date_fin); }
    if (client_id)  { sql += ' AND v.client_id=?'; p.push(client_id); }
    if (statut==='impaye') sql += ' AND v.solde>0';
    if (statut==='solde')  sql += ' AND v.solde=0';
    sql += ' ORDER BY v.date_vente DESC, v.numero ASC';
    const [rows] = await db.query(sql, p);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET prix selon catégorie client
router.get('/prix-client/:client_id', auth, async (req, res) => {
  try {
    const [client] = await db.query('SELECT categorie FROM clients WHERE id=?', [req.params.client_id]);
    if (!client.length) return res.status(404).json({ error: 'Client non trouvé' });
    const cat = client[0].categorie || 'autre_revendeur';
    const [prix] = await db.query(
      'SELECT prix_unitaire FROM prix_carton WHERE categorie=? AND actif=TRUE ORDER BY date_effet DESC LIMIT 1', [cat]
    );
    res.json({ prix_unitaire: prix[0]?.prix_unitaire || 29500, categorie: cat });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ventes
router.post('/', auth, async (req, res) => {
  try {
    const { date_vente, client_id, quantite, prix_unitaire, paiement, observations, livraison_id } = req.body;
    if (!date_vente || !client_id || !quantite)
      return res.status(400).json({ error: 'date_vente, client_id et quantite requis' });

    const qty = parseInt(quantite);
    if (qty <= 0) return res.status(400).json({ error: 'Quantité doit être positive' });

    // ── VERIFICATION STOCK ──────────────────────────────
    const [stockRows] = await db.query('SELECT cartons FROM stock_actuel WHERE id=1');
    const stockDispo  = stockRows[0]?.cartons || 0;
    if (qty > stockDispo) {
      return res.status(400).json({
        error: `Stock insuffisant ! Disponible : ${stockDispo} cartons, demandé : ${qty} cartons.`
      });
    }

    // Prix
    let pu = parseFloat(prix_unitaire) || 0;
    if (!pu) {
      const [client] = await db.query('SELECT categorie FROM clients WHERE id=?', [client_id]);
      const cat = client[0]?.categorie || 'autre_revendeur';
      const [prix] = await db.query('SELECT prix_unitaire FROM prix_carton WHERE categorie=? AND actif=TRUE ORDER BY date_effet DESC LIMIT 1', [cat]);
      pu = prix[0]?.prix_unitaire || 29500;
    }

    const pay   = parseFloat(paiement) || 0;
    const total = qty * pu;
    const solde = total - pay;

    const [maxNum] = await db.query('SELECT MAX(numero) as mx FROM ventes WHERE date_vente=?', [date_vente]);
    const numero = (maxNum[0].mx || 0) + 1;

    const [r] = await db.query(
      'INSERT INTO ventes (date_vente,numero,client_id,quantite,prix_unitaire,total,paiement,solde,observations,livraison_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [date_vente, numero, client_id, qty, pu, total, pay, solde, observations||null, livraison_id||null, req.user.id]
    );

    // Mise à jour stock (sortie)
    await db.query('UPDATE stock_actuel SET cartons=GREATEST(0,cartons-?) WHERE id=1', [qty]);
    await db.query(
      'INSERT INTO stock_mouvements (date_mouvement,type_mouvement,cartons,motif,reference_id,reference_type,created_by) VALUES (?,?,?,?,?,?,?)',
      [date_vente, 'sortie', qty, `Vente à ${client_id}`, r.insertId, 'vente', req.user.id]
    );

    // Mise à jour solde client (automatique)
    await recalcSoldeClient(client_id);

    const [newV] = await db.query('SELECT v.*,c.nom as client_nom FROM ventes v JOIN clients c ON v.client_id=c.id WHERE v.id=?', [r.insertId]);
    res.status(201).json(newV[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/ventes/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const [old] = await db.query('SELECT * FROM ventes WHERE id=?', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: 'Vente non trouvée' });

    const { quantite, prix_unitaire, paiement, observations } = req.body;
    const oldQty  = old[0].quantite;
    const newQty  = parseInt(quantite) || oldQty;
    const pu      = parseFloat(prix_unitaire) || old[0].prix_unitaire;
    const pay     = parseFloat(paiement) ?? old[0].paiement;
    const total   = newQty * pu;
    const solde   = total - pay;

    // Vérif stock si quantité augmente
    if (newQty > oldQty) {
      const diff = newQty - oldQty;
      const [stockRows] = await db.query('SELECT cartons FROM stock_actuel WHERE id=1');
      const stockDispo = stockRows[0]?.cartons || 0;
      if (diff > stockDispo) return res.status(400).json({ error: `Stock insuffisant ! Disponible : ${stockDispo} cartons.` });
      await db.query('UPDATE stock_actuel SET cartons=GREATEST(0,cartons-?) WHERE id=1', [diff]);
    } else if (newQty < oldQty) {
      // Remettre en stock
      const diff = oldQty - newQty;
      await db.query('UPDATE stock_actuel SET cartons=cartons+? WHERE id=1', [diff]);
    }

    await db.query(
      'UPDATE ventes SET quantite=?,prix_unitaire=?,total=?,paiement=?,solde=?,observations=?,updated_at=NOW() WHERE id=?',
      [newQty, pu, total, pay, solde, observations, req.params.id]
    );
    await recalcSoldeClient(old[0].client_id);

    const [v] = await db.query('SELECT v.*,c.nom as client_nom FROM ventes v JOIN clients c ON v.client_id=c.id WHERE v.id=?', [req.params.id]);
    res.json(v[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/ventes/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const [old] = await db.query('SELECT * FROM ventes WHERE id=?', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: 'Vente non trouvée' });
    // Remettre le stock
    await db.query('UPDATE stock_actuel SET cartons=cartons+? WHERE id=1', [old[0].quantite]);
    await db.query('DELETE FROM ventes WHERE id=?', [req.params.id]);
    await recalcSoldeClient(old[0].client_id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
