# Plateforme de Partage de Ressources

Application web full-stack pour partager des ressources pédagogiques (cours, examens, résumés, exercices).

## Stack utilisée

- Frontend: HTML5, CSS3, Bootstrap 5, Font Awesome, JavaScript
- Backend: Node.js + Express
- Auth: JWT
- Base de données: PostgreSQL

## Fonctionnalités

### Utilisateur
- Consulter les ressources approuvées
- Filtrer par catégories
- Rechercher par titre/mot-clé
- Uploader un fichier (PDF, DOCX, images)
- Télécharger un fichier
- Liker un document
- Choisir un profil (Étudiant/Admin) avant authentification
- Les nouveaux comptes étudiants sont en attente de validation admin

### Admin
- Approuver ou supprimer des ressources
- Approuver les nouveaux comptes étudiants
- Ajouter/supprimer des catégories
- Voir des statistiques simples (total fichiers, total téléchargements)

## Connexion à une base existante

Ce projet peut se connecter directement à vos tables PostgreSQL déjà créées (sans recréer le schéma).

1. Copier `.env.example` vers `.env`.
2. Configurer la connexion DB:
   - Option A: `DATABASE_URL=postgresql://user:password@host:5432/share`
   - Option B: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
3. Installer les dépendances:
   - `npm install`
4. Démarrer le serveur:
   - `npm start`
5. Ouvrir:
   - `http://localhost:5000`

Note: au démarrage, l'application vérifie uniquement la connexion PostgreSQL (`SELECT 1`) et n'exécute aucune migration ou création de schéma.

Les comptes admin doivent exister dans la table `users` de votre base (champ `username`, mot de passe haché compatible bcrypt dans `password_hash`, `role` = `admin`).

## Structure du projet

- `server/` API Node.js (routes, middleware, upload)
- `public/` frontend statique (HTML/CSS/JS)
