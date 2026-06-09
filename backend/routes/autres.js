const router = require('express').Router();
const db     = require('../config/db');
const auth   = require('../middleware/auth');

// ─── LIVRAISONS ───────────────────────────────────────────
router.get('/livraisons', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM livraisons ORDER BY date_livraison DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/livraisons', auth, async (req, res) => {
  try {
    const { date_livraison, quantite_cartons, fournisseur, notes } = req.body;
    if (!date_livraison || !quantite_cartons) return res.status(400).json({ error: 'date et quantite requis' });
    const qty = parseInt(quantite_cartons);
    const [r] = await db.query(
      'INSERT INTO livraisons (date_livraison,quantite_cartons,fournisseur,notes,created_by) VALUES (?,?,?,?,?)',
      [date_livraison, qty, fournisseur||null, notes||null, req.user.id]
    );
    await db.query('UPDATE stock_actuel SET cartons=cartons+? WHERE id=1', [qty]);
    await db.query(
      'INSERT INTO stock_mouvements (date_mouvement,type_mouvement,cartons,motif,reference_id,reference_type,created_by) VALUES (?,?,?,?,?,?,?)',
      [date_livraison, 'entree', qty, 'Livraison du jour', r.insertId, 'livraison', req.user.id]
    );
    const [newL] = await db.query('SELECT * FROM livraisons WHERE id=?', [r.insertId]);
    res.status(201).json(newL[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/livraisons/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const [old] = await db.query('SELECT * FROM livraisons WHERE id=?', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: 'Livraison non trouvée' });
    const { date_livraison, quantite_cartons, fournisseur, notes } = req.body;
    const diff = parseInt(quantite_cartons) - old[0].quantite_cartons;
    await db.query('UPDATE livraisons SET date_livraison=?,quantite_cartons=?,fournisseur=?,notes=? WHERE id=?',
      [date_livraison, quantite_cartons, fournisseur, notes, req.params.id]);
    if (diff !== 0) await db.query('UPDATE stock_actuel SET cartons=GREATEST(0,cartons+?) WHERE id=1', [diff]);
    const [upd] = await db.query('SELECT * FROM livraisons WHERE id=?', [req.params.id]);
    res.json(upd[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/livraisons/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const [old] = await db.query('SELECT * FROM livraisons WHERE id=?', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: 'Livraison non trouvée' });
    await db.query('UPDATE stock_actuel SET cartons=GREATEST(0,cartons-?) WHERE id=1', [old[0].quantite_cartons]);
    await db.query('DELETE FROM livraisons WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── RECOUVREMENTS ────────────────────────────────────────
router.get('/recouvrements', auth, async (req, res) => {
  try {
    const { client_id, date_debut, date_fin, date } = req.query;
    let sql = `SELECT r.*, c.nom as client_nom, c.zone FROM recouvrements r
               JOIN clients c ON r.client_id=c.id WHERE 1=1`;
    const p = [];
    if (client_id)  { sql += ' AND r.client_id=?';      p.push(client_id); }
    if (date)       { sql += ' AND r.date_paiement=?';   p.push(date); }
    if (date_debut) { sql += ' AND r.date_paiement>=?';  p.push(date_debut); }
    if (date_fin)   { sql += ' AND r.date_paiement<=?';  p.push(date_fin); }
    sql += ' ORDER BY r.date_paiement DESC, r.id DESC';
    const [rows] = await db.query(sql, p);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/recouvrements', auth, async (req, res) => {
  try {
    const { client_id, date_paiement, montant_recu, date_suivi, observation } = req.body;
    if (!client_id || !date_paiement || !montant_recu)
      return res.status(400).json({ error: 'client_id, date_paiement et montant_recu requis' });
    const cid  = parseInt(client_id);
    const recu = parseFloat(montant_recu);

    // Calculer le restant après paiement
    const [clientRow] = await db.query('SELECT solde_global FROM clients WHERE id=?', [cid]);
    const soldeActuel  = parseFloat(clientRow[0]?.solde_global || 0);
    const restant      = Math.max(0, soldeActuel - recu);

    const [r] = await db.query(
      'INSERT INTO recouvrements (client_id,date_paiement,montant_recu,montant_restant,date_suivi,observation,created_by) VALUES (?,?,?,?,?,?,?)',
      [cid, date_paiement, recu, restant, date_suivi||null, observation||null, req.user.id]
    );
    // Mettre à jour solde client
    await db.query('UPDATE clients SET solde_global=? WHERE id=?', [restant, cid]);

    const [newR] = await db.query(
      'SELECT r.*,c.nom as client_nom FROM recouvrements r JOIN clients c ON r.client_id=c.id WHERE r.id=?',
      [r.insertId]
    );
    res.status(201).json(newR[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/recouvrements/:id', auth, async (req, res) => {
  try {
    const { montant_recu, date_paiement, date_suivi, observation } = req.body;
    const [old] = await db.query('SELECT * FROM recouvrements WHERE id=?', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: 'Non trouvé' });
    const diff = parseFloat(montant_recu) - parseFloat(old[0].montant_recu);
    await db.query('UPDATE recouvrements SET montant_recu=?,date_paiement=?,date_suivi=?,observation=?,updated_at=NOW() WHERE id=?',
      [montant_recu, date_paiement, date_suivi||null, observation, req.params.id]);
    // Ajuster solde client
    if (diff !== 0) {
      await db.query('UPDATE clients SET solde_global=GREATEST(0,solde_global-?) WHERE id=?', [diff, old[0].client_id]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/recouvrements/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const [old] = await db.query('SELECT * FROM recouvrements WHERE id=?', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: 'Non trouvé' });
    // Remettre le montant dans le solde
    await db.query('UPDATE clients SET solde_global=solde_global+? WHERE id=?', [old[0].montant_recu, old[0].client_id]);
    await db.query('DELETE FROM recouvrements WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── IMPAYÉS ─────────────────────────────────────────────
router.get('/impayes', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.id,c.code,c.nom,c.telephone,c.zone,c.categorie,c.solde_global,
              COUNT(v.id) as nb_ventes_impayees, MAX(v.date_vente) as derniere_vente
       FROM clients c LEFT JOIN ventes v ON c.id=v.client_id AND v.solde>0
       WHERE c.solde_global>0 GROUP BY c.id ORDER BY c.solde_global DESC`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── STOCK ────────────────────────────────────────────────
router.get('/stock', auth, async (req, res) => {
  try {
    const [actuel]     = await db.query('SELECT * FROM stock_actuel WHERE id=1');
    const [mouvements] = await db.query('SELECT * FROM stock_mouvements ORDER BY date_mouvement DESC, id DESC LIMIT 60');
    const s = actuel[0] || { cartons:0, plateaux:0, oeufs:0 };
    res.json({ actuel: { ...s, total_oeufs: s.cartons*360 + s.plateaux*30 + (s.oeufs||0) }, mouvements });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/stock/ajuster', auth, async (req, res) => {
  try {
    const { date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif } = req.body;
    const c = parseInt(cartons)||0, p = parseInt(plateaux)||0, o = parseInt(oeufs)||0;
    if (!c && !p && !o) return res.status(400).json({ error: 'Saisissez au moins une quantité' });
    await db.query(
      'INSERT INTO stock_mouvements (date_mouvement,type_mouvement,cartons,plateaux,oeufs,motif,created_by) VALUES (?,?,?,?,?,?,?)',
      [date_mouvement||new Date().toISOString().slice(0,10), type_mouvement, c, p, o, motif||null, req.user.id]
    );
    if      (type_mouvement==='entree')     await db.query('UPDATE stock_actuel SET cartons=cartons+?,plateaux=plateaux+?,oeufs=oeufs+? WHERE id=1',[c,p,o]);
    else if (type_mouvement==='sortie'||type_mouvement==='perte') await db.query('UPDATE stock_actuel SET cartons=GREATEST(0,cartons-?),plateaux=GREATEST(0,plateaux-?),oeufs=GREATEST(0,oeufs-?) WHERE id=1',[c,p,o]);
    else if (type_mouvement==='ajustement') await db.query('UPDATE stock_actuel SET cartons=?,plateaux=?,oeufs=? WHERE id=1',[c,p,o]);
    const [actuel] = await db.query('SELECT * FROM stock_actuel WHERE id=1');
    res.json(actuel[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── PERTES ───────────────────────────────────────────────
router.get('/pertes', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM pertes ORDER BY date_perte DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/pertes', auth, async (req, res) => {
  try {
    const { date_perte, type_perte, quantite_oeufs, cause } = req.body;
    const o = parseInt(quantite_oeufs)||0;
    if (o <= 0) return res.status(400).json({ error: 'Quantité invalide' });
    const c = Math.floor(o/360), reste = o%360, p = Math.floor(reste/30), os = reste%30;
    const [r] = await db.query('INSERT INTO pertes (date_perte,type_perte,quantite_oeufs,cause,created_by) VALUES (?,?,?,?,?)',
      [date_perte, type_perte, o, cause||null, req.user.id]);
    await db.query('INSERT INTO stock_mouvements (date_mouvement,type_mouvement,cartons,plateaux,oeufs,motif,reference_id,reference_type,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [date_perte, 'perte', c, p, os, `${type_perte}: ${cause}`, r.insertId, 'perte', req.user.id]);
    await db.query('UPDATE stock_actuel SET cartons=GREATEST(0,cartons-?),plateaux=GREATEST(0,plateaux-?),oeufs=GREATEST(0,oeufs-?) WHERE id=1',[c,p,os]);
    const [newP] = await db.query('SELECT * FROM pertes WHERE id=?', [r.insertId]);
    res.status(201).json(newP[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/pertes/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const [old] = await db.query('SELECT * FROM pertes WHERE id=?', [req.params.id]);
    if (!old.length) return res.status(404).json({ error: 'Non trouvé' });
    const o = old[0].quantite_oeufs;
    const c = Math.floor(o/360), reste = o%360, p = Math.floor(reste/30), os = reste%30;
    await db.query('UPDATE stock_actuel SET cartons=cartons+?,plateaux=plateaux+?,oeufs=oeufs+? WHERE id=1',[c,p,os]);
    await db.query('DELETE FROM pertes WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── BANQUE ───────────────────────────────────────────────
router.get('/banque', auth, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;
    let sql = 'SELECT * FROM banque_mouvements WHERE 1=1';
    const p = [];
    if (date_debut) { sql += ' AND date_mouvement>=?'; p.push(date_debut); }
    if (date_fin)   { sql += ' AND date_mouvement<=?'; p.push(date_fin); }
    sql += ' ORDER BY date_mouvement DESC, id DESC';
    const [rows]  = await db.query(sql, p);
    const [solde] = await db.query('SELECT solde FROM banque_mouvements ORDER BY date_mouvement DESC, id DESC LIMIT 1');
    res.json({ mouvements: rows, solde_actuel: solde[0]?.solde || 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/banque', auth, async (req, res) => {
  try {
    const { date_mouvement, description, reference, encaissement, decaissement, commentaires } = req.body;
    if (!description) return res.status(400).json({ error: 'Description requise' });
    const enc = parseFloat(encaissement)||0, dec = parseFloat(decaissement)||0;
    const [last] = await db.query('SELECT solde FROM banque_mouvements ORDER BY date_mouvement DESC, id DESC LIMIT 1');
    const nouveauSolde = parseFloat(last[0]?.solde||0) + enc - dec;
    const [r] = await db.query(
      'INSERT INTO banque_mouvements (date_mouvement,description,reference,encaissement,decaissement,solde,commentaires,created_by) VALUES (?,?,?,?,?,?,?,?)',
      [date_mouvement, description, reference||null, enc, dec, nouveauSolde, commentaires||null, req.user.id]
    );
    const [newB] = await db.query('SELECT * FROM banque_mouvements WHERE id=?', [r.insertId]);
    res.status(201).json(newB[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/banque/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const { description, reference, encaissement, decaissement, commentaires } = req.body;
    await db.query('UPDATE banque_mouvements SET description=?,reference=?,encaissement=?,decaissement=?,commentaires=? WHERE id=?',
      [description, reference, encaissement, decaissement, commentaires, req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/banque/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    await db.query('DELETE FROM banque_mouvements WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── PRIX ─────────────────────────────────────────────────
router.get('/prix', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM prix_carton ORDER BY date_effet DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/prix', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const { date_effet, prix_unitaire, categorie } = req.body;
    if (!date_effet || !prix_unitaire) return res.status(400).json({ error: 'date et prix requis' });
    const cat = categorie || 'autre_revendeur';
    await db.query('UPDATE prix_carton SET actif=FALSE WHERE categorie=?', [cat]);
    const [r] = await db.query('INSERT INTO prix_carton (date_effet,categorie,prix_unitaire,actif,created_by) VALUES (?,?,?,TRUE,?)',
      [date_effet, cat, prix_unitaire, req.user.id]);
    const [newP] = await db.query('SELECT * FROM prix_carton WHERE id=?', [r.insertId]);
    res.status(201).json(newP[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── RAPPORT DATA ─────────────────────────────────────────
router.get('/rapport/:date', auth, async (req, res) => {
  try {
    const date = req.params.date;
    const [ventes]  = await db.query('SELECT v.*,c.nom as client_nom,c.categorie FROM ventes v JOIN clients c ON v.client_id=c.id WHERE v.date_vente=? ORDER BY v.numero',[date]);
    const [livr]    = await db.query('SELECT * FROM livraisons WHERE date_livraison=?',[date]);
    const [stock]   = await db.query('SELECT * FROM stock_actuel WHERE id=1');
    const [banque]  = await db.query('SELECT * FROM banque_mouvements WHERE date_mouvement=?',[date]);
    const [pertes]  = await db.query('SELECT * FROM pertes WHERE date_perte=?',[date]);
    const [recouv]  = await db.query('SELECT r.*,c.nom as client_nom FROM recouvrements r JOIN clients c ON r.client_id=c.id WHERE r.date_paiement=?',[date]);
    const [totaux]  = await db.query('SELECT COALESCE(SUM(total),0) as tv,COALESCE(SUM(paiement),0) as te,COALESCE(SUM(solde),0) as ti,COALESCE(SUM(quantite),0) as cartons FROM ventes WHERE date_vente=?',[date]);
    const t = totaux[0];
    res.json({
      date, livraison: livr[0]||{}, ventes, stock: stock[0]||{cartons:0,plateaux:0,oeufs:0},
      banque, pertes, recouvrements: recouv,
      totaux: { ...t, distribues: t.cartons, total_recouvrements: recouv.reduce((s,r)=>s+parseFloat(r.montant_recu||0),0),
        versement_banque: banque.reduce((s,b)=>s+parseFloat(b.encaissement||0),0),
        total_pertes_oeufs: pertes.reduce((s,p)=>s+p.quantite_oeufs,0) }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── RAPPORT PDF (HTML à imprimer) ───────────────────────
router.get('/rapport/:date/pdf', auth, async (req, res) => {
  try {
    const date = req.params.date;
    const [ventes]  = await db.query('SELECT v.*,c.nom as client_nom,c.categorie FROM ventes v JOIN clients c ON v.client_id=c.id WHERE v.date_vente=? ORDER BY v.numero',[date]);
    const [livr]    = await db.query('SELECT * FROM livraisons WHERE date_livraison=?',[date]);
    const [stock]   = await db.query('SELECT * FROM stock_actuel WHERE id=1');
    const [banque]  = await db.query('SELECT * FROM banque_mouvements WHERE date_mouvement=?',[date]);
    const [pertes]  = await db.query('SELECT * FROM pertes WHERE date_perte=?',[date]);
    const [recouv]  = await db.query('SELECT r.*,c.nom as client_nom FROM recouvrements r JOIN clients c ON r.client_id=c.id WHERE r.date_paiement=?',[date]);
    const [totaux]  = await db.query('SELECT COALESCE(SUM(total),0) as tv,COALESCE(SUM(paiement),0) as te,COALESCE(SUM(solde),0) as ti,COALESCE(SUM(quantite),0) as cartons FROM ventes WHERE date_vente=?',[date]);
    const t         = totaux[0];
    const livraison = livr[0]||{};
    const totalRecouv = recouv.reduce((s,r)=>s+parseFloat(r.montant_recu||0),0);
    const totalPertes = pertes.reduce((s,p)=>s+p.quantite_oeufs,0);
    const s = stock[0]||{cartons:0,plateaux:0,oeufs:0};
    const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n||0));
    const dateF = new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

    const catLabels = { revendeur_principal:'Revendeur Principal', autre_revendeur:'Autre Revendeur', patisserie_conso:'Patisserie/Conso' };

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Rapport ${date}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:20px;background:#fff}
  .header{text-align:center;margin-bottom:20px;border-bottom:3px solid #006644;padding-bottom:12px}
  .header h1{font-size:20px;color:#006644;margin-bottom:4px}
  .header p{color:#555;font-size:13px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
  .box{border:1.5px solid #ddd;border-radius:6px;padding:12px}
  .box-title{font-size:10px;font-weight:bold;color:#006644;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px}
  .row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f9f9f9;font-size:12px}
  .row.total{font-weight:bold;border-top:1.5px solid #ddd;border-bottom:none;padding-top:6px;margin-top:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}
  th{background:#006644;color:#fff;padding:7px 8px;text-align:left}
  td{padding:6px 8px;border-bottom:1px solid #eee}
  tr:nth-child(even) td{background:#f9f9f9}
  .total-row td{background:#e8f5e9!important;font-weight:bold}
  .green{color:#006644;font-weight:bold}
  .red{color:#cc0000;font-weight:bold}
  .section-title{font-size:12px;font-weight:bold;color:#006644;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px;border-left:4px solid #006644;padding-left:8px}
  .footer{margin-top:20px;text-align:center;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:8px}
  @media print{body{padding:10px}.no-print{display:none}}
</style>
</head>
<body>
<div class="header">
  <h1>🥚 POSITIVE DISTRIBUTION</h1>
  <p>RAPPORT JOURNALIER — ${dateF.toUpperCase()}</p>
</div>

<div class="grid2">
  <div class="box">
    <div class="box-title">📦 Livraison du jour</div>
    <div class="row"><span>Quantité reçue</span><span><b>${livraison.quantite_cartons||0} cartons</b></span></div>
    <div class="row"><span>Distribués</span><span>${t.cartons||0} cartons</span></div>
    <div class="row"><span>Fournisseur</span><span>${livraison.fournisseur||'—'}</span></div>
    <div class="row total"><span>STOCK RESTANT</span><span class="green">${s.cartons} cartons — ${s.plateaux} plateaux — ${s.oeufs} œufs</span></div>
  </div>
  <div class="box">
    <div class="box-title">💰 Résumé financier</div>
    <div class="row"><span>Total ventes</span><span><b>${fmt(t.tv)} GNF</b></span></div>
    <div class="row"><span>Encaissé (ventes)</span><span class="green">${fmt(t.te)} GNF</span></div>
    <div class="row"><span>Recouvrements</span><span class="green">${fmt(totalRecouv)} GNF</span></div>
    <div class="row"><span>Total cash</span><span class="green"><b>${fmt(t.te + totalRecouv)} GNF</b></span></div>
    <div class="row total"><span>IMPAYÉS DU JOUR</span><span class="red">${fmt(t.ti)} GNF</span></div>
  </div>
</div>

<div class="section-title">🧾 Clients servis</div>
<table>
  <thead><tr><th>N°</th><th>Client</th><th>Catégorie</th><th>Qté (ctn)</th><th>Prix/ctn</th><th>Total</th><th>Paiement</th><th>Solde</th></tr></thead>
  <tbody>
    ${ventes.map((v,i)=>`<tr>
      <td>${i+1}</td><td><b>${v.client_nom}</b></td>
      <td>${catLabels[v.categorie]||'—'}</td>
      <td>${v.quantite}</td><td>${fmt(v.prix_unitaire)}</td>
      <td>${fmt(v.total)}</td>
      <td class="green">${fmt(v.paiement)}</td>
      <td class="${v.solde>0?'red':''}">${fmt(v.solde)}</td>
    </tr>`).join('')}
    <tr class="total-row"><td colspan="3"><b>TOTAUX</b></td>
      <td><b>${t.cartons}</b></td><td>—</td>
      <td><b>${fmt(t.tv)}</b></td>
      <td class="green"><b>${fmt(t.te)}</b></td>
      <td class="red"><b>${fmt(t.ti)}</b></td>
    </tr>
  </tbody>
</table>

${recouv.length>0?`
<div class="section-title">🔁 Recouvrements du jour</div>
<table>
  <thead><tr><th>Client</th><th>Montant reçu</th><th>Restant</th><th>Observation</th></tr></thead>
  <tbody>
    ${recouv.map(r=>`<tr><td><b>${r.client_nom}</b></td><td class="green">${fmt(r.montant_recu)} GNF</td><td class="${r.montant_restant>0?'red':''}">${fmt(r.montant_restant)} GNF</td><td>${r.observation||'—'}</td></tr>`).join('')}
    <tr class="total-row"><td><b>TOTAL CASH</b></td><td class="green"><b>${fmt(totalRecouv)} GNF</b></td><td></td><td></td></tr>
  </tbody>
</table>`:''}

<div class="grid2">
  <div class="box">
    <div class="box-title">🏦 Banque</div>
    ${banque.length===0?'<div style="color:#999">Aucun mouvement</div>':
    banque.map(b=>`<div class="row"><span>${b.description}</span><span class="${b.encaissement>0?'green':'red'}">${b.encaissement>0?'+'+fmt(b.encaissement):'-'+fmt(b.decaissement)} GNF</span></div>`).join('')}
    <div class="row total"><span>Total versé</span><span class="green">${fmt(banque.reduce((s,b)=>s+parseFloat(b.encaissement||0),0))} GNF</span></div>
  </div>
  <div class="box">
    <div class="box-title">🚫 Pertes & Casse</div>
    ${totalPertes===0?'<div style="color:#999">Aucune perte</div>':
    pertes.map(p=>`<div class="row"><span>${p.type_perte} — ${p.cause||''}</span><span class="red">${p.quantite_oeufs} œufs</span></div>`).join('')+
    `<div class="row total"><span>Total</span><span class="red">${fmt(totalPertes)} œufs</span></div>`}
  </div>
</div>

<div class="footer">
  Rapport généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} — Positive Distribution<br>
  <span style="color:#006644;font-weight:bold">IMPAYÉS CUMULÉS TOTAL : ${fmt(0)} GNF</span>
</div>

<div class="no-print" style="text-align:center;margin-top:20px">
  <button onclick="window.print()" style="padding:10px 24px;background:#006644;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">🖨️ Imprimer / Enregistrer PDF</button>
</div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── DASHBOARD ────────────────────────────────────────────
router.get('/dashboard', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0,10);
    const [vj]  = await db.query('SELECT COALESCE(SUM(total),0) as tv, COALESCE(SUM(paiement),0) as te, COALESCE(SUM(solde),0) as ti FROM ventes WHERE date_vente=?',[today]);
    const [vh]  = await db.query('SELECT COALESCE(SUM(total),0) as tv FROM ventes WHERE date_vente=DATE_SUB(?,INTERVAL 1 DAY)',[today]);
    const [stk] = await db.query('SELECT * FROM stock_actuel WHERE id=1');
    const [bnk] = await db.query('SELECT solde FROM banque_mouvements ORDER BY date_mouvement DESC, id DESC LIMIT 1');
    const [imp] = await db.query('SELECT COUNT(*) as nb, COALESCE(SUM(solde_global),0) as total FROM clients WHERE solde_global>0');
    const [sem] = await db.query('SELECT date_vente, SUM(total) as total FROM ventes WHERE date_vente>=DATE_SUB(?,INTERVAL 7 DAY) GROUP BY date_vente ORDER BY date_vente',[today]);
    const [deb] = await db.query('SELECT nom,zone,categorie,solde_global FROM clients WHERE solde_global>0 ORDER BY solde_global DESC LIMIT 8');
    const [bnkM]= await db.query('SELECT * FROM banque_mouvements ORDER BY date_mouvement DESC, id DESC LIMIT 5');
    const [va]  = await db.query('SELECT v.*,c.nom as client_nom,c.categorie FROM ventes v JOIN clients c ON v.client_id=c.id WHERE v.date_vente=? ORDER BY v.numero',[today]);
    const [stko]= await db.query('SELECT * FROM stock_actuel WHERE id=1');
    res.json({ ventes_jour:vj[0], ventes_hier:vh[0], stock:stko[0]||{cartons:0,plateaux:0,oeufs:0},
      banque_solde:bnk[0]?.solde||0, impayes:imp[0], ventes_semaine:sem,
      debiteurs:deb, derniers_mouvements_banque:bnkM, ventes_aujourdhui:va });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
