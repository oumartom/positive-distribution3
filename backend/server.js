require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
if (!process.env.MYSQLHOST && !process.env.DB_HOST) require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');

const app = express();

// Uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const tmpDir = path.join(uploadDir, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

// Frontend
const frontendPath = path.join(__dirname, '..', 'frontend', 'public');
app.use(express.static(frontendPath));

// Upload fichiers joints
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1e9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10*1024*1024 } });

app.post('/api/upload', require('./middleware/auth'), upload.single('fichier'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  res.json({ url: `/uploads/${req.file.filename}`, nom: req.file.originalname });
});

// Health check — Railway vérifie que le serveur répond
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Routes API
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/ventes',  require('./routes/ventes'));
app.use('/api/excel',   require('./routes/excel'));
app.use('/api',         require('./routes/autres'));

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

// ── DÉMARRAGE IMMÉDIAT — sans attendre MySQL ──────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Positive Distribution v4 démarré`);
  console.log(`   ➜  PORT: ${PORT}`);
  console.log(`   ➜  ENV: ${process.env.NODE_ENV || 'development'}\n`);
});

// Init BD en arrière-plan après démarrage du serveur
setTimeout(() => {
  require('./init-db')()
    .then(() => console.log('✅ BD initialisée'))
    .catch(e => console.error('⚠️  Init BD:', e.message));
}, 3000);
