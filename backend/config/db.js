const mysql = require('mysql2/promise');

// Lire les variables Railway ou locales
const host     = process.env.MYSQLHOST     || process.env.DB_HOST     || 'localhost';
const port     = parseInt(process.env.MYSQLPORT     || process.env.DB_PORT     || '3306');
const user     = process.env.MYSQLUSER     || process.env.DB_USER     || 'root';
const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '';
const database = process.env.MYSQLDATABASE || process.env.DB_NAME     || 'railway';

console.log(`🔌 MySQL: ${user}@${host}:${port}/${database}`);

const pool = mysql.createPool({
  host, port, user, password, database,
  waitForConnections: true,
  connectionLimit:    10,
  connectTimeout:     60000,
  // PAS de SSL — Railway internal ne le requiert pas
});

// Test de connexion NON bloquant — le serveur démarre quand même
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connecté !');
    conn.release();
  })
  .catch(err => {
    // Juste un warning — NE PAS faire process.exit()
    console.error('⚠️  MySQL warning:', err.message);
    console.error('   Le serveur continue, retry automatique...');
  });

module.exports = pool;
