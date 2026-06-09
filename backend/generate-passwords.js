/**
 * POSITIVE DISTRIBUTION — Génération des mots de passe
 * Lancer UNE SEULE FOIS après npm install :
 *   node generate-passwords.js
 *
 * Ce script génère les hash bcrypt et met à jour la BD automatiquement.
 * Mot de passe par défaut pour tous : Positive2026!
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql  = require('mysql2/promise');

const users = [
  { email: 'oumar@positive.gn',     password: 'Positive2026!' },
  { email: 'abdoulaye@positive.gn', password: 'Positive2026!' },
  { email: 'brahim@positive.gn',    password: 'Positive2026!' },
  { email: 'zenab@positive.gn',     password: 'Positive2026!' },
  { email: 'bechir@positive.gn',    password: 'Positive2026!' },
  { email: 'moussa@positive.gn',    password: 'Positive2026!' },
];

async function main() {
  const db = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'oumartom',
    database: process.env.DB_NAME     || 'positive_distribution',
  });

  console.log('✅ Connecté à MySQL\n');
  console.log('Génération des mots de passe...\n');

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    const [result] = await db.query(
      'UPDATE utilisateurs SET mot_de_passe=? WHERE email=?',
      [hash, u.email]
    );
    if (result.affectedRows > 0) {
      console.log(`✓ ${u.email}  →  mot de passe : ${u.password}`);
    } else {
      console.log(`✗ ${u.email}  →  utilisateur non trouvé (vérifiez la BD)`);
    }
  }

  await db.end();
  console.log('\n✅ Terminé ! Vous pouvez maintenant vous connecter.');
  console.log('   Exemple : oumar@positive.gn / Positive2026!\n');
}

main().catch(e => {
  console.error('❌ Erreur :', e.message);
  process.exit(1);
});
