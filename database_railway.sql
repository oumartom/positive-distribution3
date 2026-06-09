-- ============================================================
--  POSITIVE DISTRIBUTION v3 — Pour Railway
--  Railway crée déjà la BD "railway" — on ne la recrée pas
-- ============================================================

-- Si vous utilisez Railway MySQL, DB_NAME=railway
-- Si vous utilisez votre propre serveur, changez selon vos besoins

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(50) NOT NULL UNIQUE,
  permissions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS utilisateurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  mot_de_passe VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  statut ENUM('actif','inactif') DEFAULT 'actif',
  dernier_acces TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  nom VARCHAR(150) NOT NULL,
  telephone VARCHAR(30),
  zone VARCHAR(100),
  adresse TEXT,
  categorie ENUM('revendeur_principal','autre_revendeur','patisserie_conso') DEFAULT 'autre_revendeur',
  statut ENUM('actif','inactif','archive') DEFAULT 'actif',
  observation TEXT,
  solde_global DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prix_carton (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_effet DATE NOT NULL,
  categorie ENUM('revendeur_principal','autre_revendeur','patisserie_conso') NOT NULL,
  prix_unitaire DECIMAL(15,2) NOT NULL,
  actif BOOLEAN DEFAULT FALSE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS livraisons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_livraison DATE NOT NULL,
  quantite_cartons INT NOT NULL DEFAULT 0,
  fournisseur VARCHAR(150),
  notes TEXT,
  fichier_facture VARCHAR(255),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ventes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_vente DATE NOT NULL,
  numero INT NOT NULL,
  client_id INT NOT NULL,
  quantite INT NOT NULL DEFAULT 0,
  prix_unitaire DECIMAL(15,2) NOT NULL,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  paiement DECIMAL(15,2) DEFAULT 0,
  solde DECIMAL(15,2) NOT NULL DEFAULT 0,
  observations TEXT,
  livraison_id INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (livraison_id) REFERENCES livraisons(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS recouvrements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  date_paiement DATE NOT NULL,
  montant_recu DECIMAL(15,2) NOT NULL,
  montant_restant DECIMAL(15,2) DEFAULT 0,
  date_suivi DATE,
  observation TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stock_mouvements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_mouvement DATE NOT NULL,
  type_mouvement ENUM('entree','sortie','perte','ajustement') NOT NULL,
  cartons INT DEFAULT 0,
  plateaux INT DEFAULT 0,
  oeufs INT DEFAULT 0,
  motif TEXT,
  reference_id INT,
  reference_type VARCHAR(50),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stock_actuel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cartons INT DEFAULT 0,
  plateaux INT DEFAULT 0,
  oeufs INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pertes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_perte DATE NOT NULL,
  type_perte ENUM('casse','perte','manquant','abime') NOT NULL,
  quantite_oeufs INT NOT NULL DEFAULT 0,
  cause TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS banque_mouvements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_mouvement DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  reference VARCHAR(100),
  encaissement DECIMAL(15,2) DEFAULT 0,
  decaissement DECIMAL(15,2) DEFAULT 0,
  solde DECIMAL(15,2) DEFAULT 0,
  commentaires TEXT,
  fichier_bordereau VARCHAR(255),
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rapports_journaliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_rapport DATE NOT NULL UNIQUE,
  donnees_json JSON,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── DONNÉES INITIALES ────────────────────────────────────

INSERT IGNORE INTO roles (nom, permissions) VALUES
('admin',      '{"all":true}'),
('commercial', '{"ventes":true,"livraisons":true,"recouvrements":true,"stock":true,"clients":true}');

-- Utilisateurs (mots de passe générés par generate-passwords.js)
-- Mot de passe temporaire en clair stocké, sera remplacé par le script
INSERT IGNORE INTO utilisateurs (nom, email, mot_de_passe, role_id) VALUES
('Oumar',     'oumar@positive.gn',     'TEMP_WILL_BE_HASHED', 1),
('Abdoulaye', 'abdoulaye@positive.gn', 'TEMP_WILL_BE_HASHED', 1),
('Brahim',    'brahim@positive.gn',    'TEMP_WILL_BE_HASHED', 1),
('Zenab',     'zenab@positive.gn',     'TEMP_WILL_BE_HASHED', 1),
('Bechir',    'bechir@positive.gn',    'TEMP_WILL_BE_HASHED', 2),
('Moussa',    'moussa@positive.gn',    'TEMP_WILL_BE_HASHED', 2);

-- Prix
INSERT IGNORE INTO prix_carton (date_effet, categorie, prix_unitaire, actif) VALUES
('2026-06-02', 'revendeur_principal', 29000, TRUE),
('2026-06-02', 'autre_revendeur',     29500, TRUE),
('2026-06-02', 'patisserie_conso',    33000, TRUE);

-- Stock initial
INSERT IGNORE INTO stock_actuel (id, cartons, plateaux, oeufs) VALUES (1, 2, 0, 15);

-- Clients réels
INSERT IGNORE INTO clients (code, nom, zone, categorie, statut, solde_global) VALUES
('CLI-001', 'Voisin Chaibo Dembe',          'Dembe',             'revendeur_principal', 'actif', 0),
('CLI-002', 'Goni Gassi',                   'Gassi',             'revendeur_principal', 'actif', 0),
('CLI-003', 'Adam Issakha Idriss Farcha',   'Farcha Djougoulie', 'revendeur_principal', 'actif', 720000),
('CLI-004', 'Mht Ismail Farcha Djougoulie', 'Farcha Djougoulie', 'revendeur_principal', 'actif', 580000),
('CLI-005', 'Achou Farcha Djougoulie',      'Farcha Djougoulie', 'revendeur_principal', 'actif', 295000),
('CLI-006', 'Hadje Mariam Massaguet',       'Massaguet',         'autre_revendeur',     'actif', 590000),
('CLI-007', 'Hadje Mariam Bitkine',         'Bitkine',           'autre_revendeur',     'actif', 590000),
('CLI-008', 'Moussa Kello',                 'Kello',             'autre_revendeur',     'actif', 0),
('CLI-009', 'Haroune BEAC Sandwicherie',    'Centre',            'autre_revendeur',     'actif', 0),
('CLI-010', 'Vente Directe',                NULL,                'autre_revendeur',     'actif', 295000),
('CLI-011', 'Clients Divers',               NULL,                'autre_revendeur',     'actif', 0),
('CLI-012', 'Abba Ali Souleymane Abeche',   'Abeche',            'autre_revendeur',     'actif', 3097500),
('CLI-013', 'SPP Sopetrans',                'Centre',            'patisserie_conso',    'actif', 0),
('CLI-014', 'AG',                           'Centre',            'patisserie_conso',    'actif', 264000),
('CLI-015', 'Pain Dore',                    'Centre',            'patisserie_conso',    'actif', 0);

-- Banque
INSERT IGNORE INTO banque_mouvements (date_mouvement, description, reference, encaissement, decaissement, solde) VALUES
('2026-06-05', 'Cash recouvrements 05/06', 'RCV-0605', 490000, 0, 490000);
