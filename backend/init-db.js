const mysql  = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs     = require('fs');
const path   = require('path');

async function initDB() {
  const config = {
    host:     process.env.MYSQLHOST     || process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQLPORT     || process.env.DB_PORT     || '3306'),
    user:     process.env.MYSQLUSER     || process.env.DB_USER     || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME     || 'railway',
    connectTimeout: 60000,
    multipleStatements: true
  };

  console.log(`🔧 Init DB: ${config.user}@${config.host}:${config.port}/${config.database}`);

  let conn;
  // Retry 5 fois avec délai
  for (let i = 1; i <= 5; i++) {
    try {
      conn = await mysql.createConnection(config);
      console.log(`✅ Init DB connectée (tentative ${i})`);
      break;
    } catch(e) {
      console.error(`⚠️  Tentative ${i}/5 échouée: ${e.message}`);
      if (i === 5) throw e;
      await new Promise(r => setTimeout(r, 3000 * i));
    }
  }

  // Créer les tables
  const sqlPath = path.join(__dirname, '..', 'database_railway.sql');
  if (fs.existsSync(sqlPath)) {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = sql.split(';').map(s=>s.trim()).filter(s=>s.length>0 && !s.startsWith('--'));
    for (const stmt of statements) {
      try { await conn.query(stmt); } catch(e) { /* ignorer doublons */ }
    }
    console.log('✅ Tables créées/vérifiées');
  }

  // Hash des mots de passe
  const users = [
    'oumar@positive.gn', 'abdoulaye@positive.gn',
    'brahim@positive.gn', 'zenab@positive.gn',
    'bechir@positive.gn', 'moussa@positive.gn'
  ];
  for (const email of users) {
    const [rows] = await conn.query('SELECT mot_de_passe FROM utilisateurs WHERE email=?', [email]);
    if (rows.length && rows[0].mot_de_passe.length < 30) {
      const hash = await bcrypt.hash('Positive2026!', 10);
      await conn.query('UPDATE utilisateurs SET mot_de_passe=? WHERE email=?', [hash, email]);
      console.log(`✅ Password: ${email}`);
    }
  }

  await conn.end();
  console.log('✅ Initialisation terminée !');
}

module.exports = initDB;
