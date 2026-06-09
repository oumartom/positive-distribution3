const router = require('express').Router();
const db     = require('../config/db');
const auth   = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { search, zone, statut, categorie } = req.query;
    let sql = 'SELECT * FROM clients WHERE 1=1';
    const p = [];
    if (search)    { sql += ' AND (nom LIKE ? OR code LIKE ? OR telephone LIKE ?)'; p.push(`%${search}%`,`%${search}%`,`%${search}%`); }
    if (zone)      { sql += ' AND zone=?';      p.push(zone); }
    if (statut)    { sql += ' AND statut=?';    p.push(statut); }
    if (categorie) { sql += ' AND categorie=?'; p.push(categorie); }
    sql += ' ORDER BY nom ASC';
    const [rows] = await db.query(sql, p);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clients WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Client non trouvé' });
    const [ventes]    = await db.query('SELECT v.*,c.nom as client_nom FROM ventes v JOIN clients c ON v.client_id=c.id WHERE v.client_id=? ORDER BY date_vente DESC LIMIT 30', [req.params.id]);
    const [paiements] = await db.query('SELECT * FROM recouvrements WHERE client_id=? ORDER BY date_paiement DESC LIMIT 30', [req.params.id]);
    res.json({ ...rows[0], ventes, paiements });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { nom, telephone, zone, adresse, categorie, statut, observation } = req.body;
    if (!nom) return res.status(400).json({ error: 'Nom requis' });
    const [last] = await db.query('SELECT MAX(id) as mid FROM clients');
    const code = `CLI-${String((last[0].mid||0)+1).padStart(3,'0')}`;
    const [r] = await db.query(
      'INSERT INTO clients (code,nom,telephone,zone,adresse,categorie,statut,observation) VALUES (?,?,?,?,?,?,?,?)',
      [code, nom, telephone||null, zone||null, adresse||null, categorie||'autre_revendeur', statut||'actif', observation||null]
    );
    const [newC] = await db.query('SELECT * FROM clients WHERE id=?', [r.insertId]);
    res.status(201).json(newC[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { nom, telephone, zone, adresse, categorie, statut, observation } = req.body;
    await db.query(
      'UPDATE clients SET nom=?,telephone=?,zone=?,adresse=?,categorie=?,statut=?,observation=?,updated_at=NOW() WHERE id=?',
      [nom, telephone, zone, adresse, categorie, statut, observation, req.params.id]
    );
    const [rows] = await db.query('SELECT * FROM clients WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    // Archiver plutôt que supprimer si des ventes existent
    const [ventes] = await db.query('SELECT COUNT(*) as n FROM ventes WHERE client_id=?', [req.params.id]);
    if (ventes[0].n > 0) {
      await db.query("UPDATE clients SET statut='archive' WHERE id=?", [req.params.id]);
      return res.json({ success: true, message: 'Client archivé (a des ventes)' });
    }
    await db.query('DELETE FROM clients WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
