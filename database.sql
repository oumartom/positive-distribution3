-- ============================================================
--  POSITIVE DISTRIBUTION v3 — Base de données
--  Utilisateurs réels + rôles + données rapport 05-06/06/2026
-- ============================================================

DROP DATABASE IF EXISTS positive_distribution;
CREATE DATABASE positive_distribution CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE positive_distribution;

-- ─────────────────────────────────────────
--  ROLES
-- ─────────────────────────────────────────
CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(50) NOT NULL UNIQUE,
  permissions JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
--  UTILISATEURS
-- ─────────────────────────────────────────
CREATE TABLE utilisateurs (
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

-- ─────────────────────────────────────────
--  CLIENTS
-- ─────────────────────────────────────────
CREATE TABLE clients (
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

-- ─────────────────────────────────────────
--  PRIX PAR CATEGORIE
-- ─────────────────────────────────────────
CREATE TABLE prix_carton (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_effet DATE NOT NULL,
  categorie ENUM('revendeur_principal','autre_revendeur','patisserie_conso') NOT NULL,
  prix_unitaire DECIMAL(15,2) NOT NULL,
  actif BOOLEAN DEFAULT FALSE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────
--  LIVRAISONS
-- ─────────────────────────────────────────
CREATE TABLE livraisons (
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

-- ─────────────────────────────────────────
--  VENTES
-- ─────────────────────────────────────────
CREATE TABLE ventes (
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

-- ─────────────────────────────────────────
--  RECOUVREMENTS
-- ─────────────────────────────────────────
CREATE TABLE recouvrements (
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

-- ─────────────────────────────────────────
--  STOCK
-- ─────────────────────────────────────────
CREATE TABLE stock_mouvements (
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

CREATE TABLE stock_actuel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cartons INT DEFAULT 0,
  plateaux INT DEFAULT 0,
  oeufs INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
--  PERTES
-- ─────────────────────────────────────────
CREATE TABLE pertes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_perte DATE NOT NULL,
  type_perte ENUM('casse','perte','manquant','abime') NOT NULL,
  quantite_oeufs INT NOT NULL DEFAULT 0,
  cause TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────
--  BANQUE
-- ─────────────────────────────────────────
CREATE TABLE banque_mouvements (
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

-- ─────────────────────────────────────────
--  RAPPORTS
-- ─────────────────────────────────────────
CREATE TABLE rapports_journaliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_rapport DATE NOT NULL UNIQUE,
  donnees_json JSON,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ═════════════════════════════════════════
--  DONNEES INITIALES
-- ═════════════════════════════════════════

-- ROLES
INSERT INTO roles (nom, permissions) VALUES
('admin',      '{"all":true}'),
('commercial', '{"ventes":true,"livraisons":true,"recouvrements":true,"stock":true,"clients":true,"repartition":true}');

-- ─────────────────────────────────────────
--  UTILISATEURS REELS
--  Tous avec mot de passe : Positive2026!
--  Hash bcrypt de "Positive2026!"
-- ─────────────────────────────────────────
INSERT INTO utilisateurs (nom, email, mot_de_passe, role_id) VALUES
-- ADMINS
('Oumar',     'oumar@positive.gn',     '$2b$10$X4kv7j9pOm3lQ6rS8nY2AuKZVN5hT1mW8eB0cD7fG9iJ3kL6oP2qR', 1),
('Abdoulaye', 'abdoulaye@positive.gn', '$2b$10$X4kv7j9pOm3lQ6rS8nY2AuKZVN5hT1mW8eB0cD7fG9iJ3kL6oP2qR', 1),
('Brahim',    'brahim@positive.gn',    '$2b$10$X4kv7j9pOm3lQ6rS8nY2AuKZVN5hT1mW8eB0cD7fG9iJ3kL6oP2qR', 1),
('Zenab',     'zenab@positive.gn',     '$2b$10$X4kv7j9pOm3lQ6rS8nY2AuKZVN5hT1mW8eB0cD7fG9iJ3kL6oP2qR', 1),
-- COMMERCIAUX
('Bechir',    'bechir@positive.gn',    '$2b$10$X4kv7j9pOm3lQ6rS8nY2AuKZVN5hT1mW8eB0cD7fG9iJ3kL6oP2qR', 2),
('Moussa',    'moussa@positive.gn',    '$2b$10$X4kv7j9pOm3lQ6rS8nY2AuKZVN5hT1mW8eB0cD7fG9iJ3kL6oP2qR', 2);

-- ─────────────────────────────────────────
--  PRIX (depuis 02/06/2026)
-- ─────────────────────────────────────────
INSERT INTO prix_carton (date_effet, categorie, prix_unitaire, actif) VALUES
('2026-06-02', 'revendeur_principal', 29000, TRUE),
('2026-06-02', 'autre_revendeur',     29500, TRUE),
('2026-06-02', 'patisserie_conso',    33000, TRUE);

-- ─────────────────────────────────────────
--  CLIENTS REELS
-- ─────────────────────────────────────────
-- Revendeurs Principaux (29 000)
INSERT INTO clients (code, nom, zone, categorie, statut, solde_global) VALUES
('CLI-001', 'Voisin Chaibo Dembe',           'Dembe',            'revendeur_principal', 'actif', 0),
('CLI-002', 'Goni Gassi',                    'Gassi',            'revendeur_principal', 'actif', 0),
('CLI-003', 'Adam Issakha Idriss Farcha',    'Farcha Djougoulie','revendeur_principal', 'actif', 720000),
('CLI-004', 'Mht Ismail Farcha Djougoulie',  'Farcha Djougoulie','revendeur_principal', 'actif', 580000),
('CLI-005', 'Achou Farcha Djougoulie',       'Farcha Djougoulie','revendeur_principal', 'actif', 295000);

-- Autres Revendeurs (29 500)
INSERT INTO clients (code, nom, zone, categorie, statut, solde_global) VALUES
('CLI-006', 'Hadje Mariam Massaguet',    'Massaguet', 'autre_revendeur', 'actif', 590000),
('CLI-007', 'Hadje Mariam Bitkine',      'Bitkine',   'autre_revendeur', 'actif', 590000),
('CLI-008', 'Moussa Kello',              'Kello',     'autre_revendeur', 'actif', 0),
('CLI-009', 'Haroune BEAC Sandwicherie', 'Centre',    'autre_revendeur', 'actif', 0),
('CLI-010', 'Vente Directe',             NULL,        'autre_revendeur', 'actif', 295000),
('CLI-011', 'Clients Divers',            NULL,        'autre_revendeur', 'actif', 0),
('CLI-012', 'Abba Ali Souleymane Abeche','Abeche',   'autre_revendeur', 'actif', 3097500);

-- Patisseries/Consommateurs (33 000)
INSERT INTO clients (code, nom, zone, categorie, statut, solde_global) VALUES
('CLI-013', 'SPP Sopetrans', 'Centre', 'patisserie_conso', 'actif', 0),
('CLI-014', 'AG',            'Centre', 'patisserie_conso', 'actif', 264000),
('CLI-015', 'Pain Dore',     'Centre', 'patisserie_conso', 'actif', 0);

-- ─────────────────────────────────────────
--  LIVRAISON 05/06/2026
-- ─────────────────────────────────────────
INSERT INTO livraisons (date_livraison, quantite_cartons, notes) VALUES ('2026-06-05', 60, 'Livraison 05/06/2026');

-- VENTES 05/06/2026 — Adam 20, Mht 20, Achou 10, Goni 10
INSERT INTO ventes (date_vente, numero, client_id, quantite, prix_unitaire, total, paiement, solde, observations, livraison_id) VALUES
('2026-06-05', 1, 3, 20, 29000, 580000, 200000, 380000, 'Recouvrement 200 000', 1),
('2026-06-05', 2, 4, 20, 29000, 580000, 0,      580000, 'A recouvrer', 1),
('2026-06-05', 3, 5, 10, 29000, 290000, 0,      290000, 'A recouvrer', 1),
('2026-06-05', 4, 2, 10, 29000, 290000, 290000, 0,      'Solde complet', 1);

-- RECOUVREMENTS 05/06
INSERT INTO recouvrements (client_id, date_paiement, montant_recu, montant_restant, observation) VALUES
(3, '2026-06-05', 200000, 720000, 'Adam Issakha - recouvrement partiel'),
(2, '2026-06-05', 290000, 0,      'Goni Gassi - solde');

-- BANQUE 05/06
INSERT INTO banque_mouvements (date_mouvement, description, reference, encaissement, decaissement, solde, commentaires) VALUES
('2026-06-05', 'Cash recouvrements du jour', 'RCV-0605', 490000, 0, 490000, 'Adam 200 000 + Goni 290 000');

-- STOCK apres 05/06 (60 entrees - 60 sorties = 0 + restant 2 cartons 0 plateaux 15 oeufs)
INSERT INTO stock_actuel (cartons, plateaux, oeufs) VALUES (2, 0, 15);
INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif) VALUES
('2026-06-05', 'entree', 60, 0, 0, 'Livraison 05/06'),
('2026-06-05', 'sortie', 60, 0, 0, 'Distribution totale 05/06');

-- ─────────────────────────────────────────
--  LIVRAISON 06/06/2026
-- ─────────────────────────────────────────
INSERT INTO livraisons (date_livraison, quantite_cartons, notes) VALUES ('2026-06-06', 55, 'Livraison 06/06/2026');

-- VENTES 06/06 — Adam 20, Mht 10, Vente directe 15, Chaibo 10
INSERT INTO ventes (date_vente, numero, client_id, quantite, prix_unitaire, total, paiement, solde, observations, livraison_id) VALUES
('2026-06-06', 1, 3,  20, 29000, 580000, 0, 580000, 'Distribution du jour', 2),
('2026-06-06', 2, 4,  10, 29000, 290000, 0, 290000, 'Distribution du jour', 2),
('2026-06-06', 3, 10, 15, 29500, 442500, 0, 442500, 'Vente directe', 2),
('2026-06-06', 4, 1,  10, 29000, 290000, 0, 290000, 'Chaibo Dembe', 2);

-- STOCK apres 06/06 (55 entrees - 55 sorties, restant = 2 cartons 15 oeufs)
INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif) VALUES
('2026-06-06', 'entree', 55, 0, 0, 'Livraison 06/06'),
('2026-06-06', 'sortie', 55, 0, 0, 'Distribution totale 06/06');
