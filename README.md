# 🥚 Positive Distribution v3

## Installation (3 étapes)

### 1. Importer la base de données
```bash
mysql -u root -p < database.sql
```

### 2. Installer les dépendances
```bash
cd backend
npm install
```

### 3. Générer les mots de passe (OBLIGATOIRE avant de lancer)
```bash
node generate-passwords.js
```
Ce script met à jour les mots de passe dans la BD.
Résultat attendu :
✓ oumar@positive.gn      → Positive2026!
✓ abdoulaye@positive.gn  → Positive2026!
✓ brahim@positive.gn     → Positive2026!
✓ zenab@positive.gn      → Positive2026!
✓ bechir@positive.gn     → Positive2026!
✓ moussa@positive.gn     → Positive2026!

### 4. Lancer le serveur
```bash
npm start
```

### 5. Accéder
http://localhost:3001

---

## Comptes utilisateurs

| Nom       | Email                    | Rôle        | Mot de passe  |
|-----------|--------------------------|-------------|---------------|
| Oumar     | oumar@positive.gn        | Admin       | Positive2026! |
| Abdoulaye | abdoulaye@positive.gn    | Admin       | Positive2026! |
| Brahim    | brahim@positive.gn       | Admin       | Positive2026! |
| Zenab     | zenab@positive.gn        | Admin       | Positive2026! |
| Bechir    | bechir@positive.gn       | Commercial  | Positive2026! |
| Moussa    | moussa@positive.gn       | Commercial  | Positive2026! |

**Admins** : accès complet, CRUD partout, suppression, utilisateurs
**Commerciaux** : ventes, livraisons, recouvrements, stock (entrée/sortie), rapport — pas de suppression

---

## Corrections v3

- ✅ Données temps réel : impayés mis à jour dès qu'une vente est enregistrée
- ✅ Solde client recalculé automatiquement après chaque vente/recouvrement
- ✅ CRUD complet : modifier et supprimer sur toutes les tables
- ✅ Vérification stock : impossible de distribuer plus que le stock disponible
- ✅ Connexion : script generate-passwords.js pour initialiser les mots de passe
- ✅ Recouvrements : recherche par date (du/au), affiche solde client en temps réel
- ✅ Rôles réels : Oumar/Abdoulaye/Brahim/Zenab = Admin, Bechir/Moussa = Commercial
- ✅ Prix auto selon catégorie client, modifiable par vente
- ✅ PDF rapport (ouvre dans nouvel onglet → imprimer/enregistrer)
- ✅ Thème clair/sombre
- ✅ Bouton edit/delete visible selon le rôle (admin = tout, commercial = pas de suppression)
