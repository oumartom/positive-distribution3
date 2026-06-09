const router = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');
const auth    = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, mot_de_passe } = req.body;
    if (!email || !mot_de_passe)
      return res.status(400).json({ error: 'Email et mot de passe requis' });

    const [rows] = await db.query(
      `SELECT u.*, r.nom as role_nom, r.permissions
       FROM utilisateurs u JOIN roles r ON u.role_id = r.id
       WHERE u.email = ? AND u.statut = 'actif'`, [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'Identifiants incorrects' });

    const user = rows[0];
    const ok   = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });

    await db.query('UPDATE utilisateurs SET dernier_acces=NOW() WHERE id=?', [user.id]);

    const token = jwt.sign(
      { id: user.id, nom: user.nom, email: user.email, role: user.role_nom, permissions: user.permissions },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, nom: user.nom, email: user.email, role: user.role_nom } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT u.id,u.nom,u.email,r.nom as role FROM utilisateurs u JOIN roles r ON u.role_id=r.id WHERE u.id=?',
      [req.user.id]
    );
    res.json(rows[0] || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/auth/users — liste (admin seulement)
router.get('/users', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const [rows] = await db.query(
      'SELECT u.id,u.nom,u.email,u.statut,u.dernier_acces,r.nom as role FROM utilisateurs u JOIN roles r ON u.role_id=r.id ORDER BY u.nom'
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/users — créer utilisateur (admin)
router.post('/users', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const { nom, email, mot_de_passe, role_id } = req.body;
    if (!nom || !email || !mot_de_passe) return res.status(400).json({ error: 'Champs requis manquants' });
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const [r] = await db.query(
      'INSERT INTO utilisateurs (nom,email,mot_de_passe,role_id) VALUES (?,?,?,?)',
      [nom, email, hash, role_id || 2]
    );
    res.status(201).json({ id: r.insertId, nom, email });
  } catch(e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/auth/users/:id — modifier (admin)
router.put('/users/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const { nom, email, mot_de_passe, role_id, statut } = req.body;
    if (mot_de_passe) {
      const hash = await bcrypt.hash(mot_de_passe, 10);
      await db.query('UPDATE utilisateurs SET nom=?,email=?,mot_de_passe=?,role_id=?,statut=? WHERE id=?',
        [nom, email, hash, role_id, statut, req.params.id]);
    } else {
      await db.query('UPDATE utilisateurs SET nom=?,email=?,role_id=?,statut=? WHERE id=?',
        [nom, email, role_id, statut, req.params.id]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    if (req.params.id == req.user.id) return res.status(400).json({ error: 'Impossible de supprimer son propre compte' });
    await db.query('UPDATE utilisateurs SET statut=? WHERE id=?', ['inactif', req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/auth/reset-password — génère et met à jour le mot de passe
router.post('/reset-password', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    const { user_id, nouveau_mot_de_passe } = req.body;
    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await db.query('UPDATE utilisateurs SET mot_de_passe=? WHERE id=?', [hash, user_id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
