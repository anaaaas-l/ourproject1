# Cahier des charges — Plateforme « Documents entre étudiants »

**Version :** 1.0 (état au 13 mai 2026)  
**Projet :** OurProject1 — partage de documents entre étudiants et administration associée.

---

## 1. Contexte et objectifs

### 1.1 Contexte

Application web **full-stack** destinée à un établissement utilisant des **adresses email académiques** (domaine `.ac.ma`). Elle permet aux **étudiants** de partager des fichiers entre pairs et aux **administrateurs** de gérer les comptes, les catégories et les ressources « officielles » en attente de validation.

### 1.2 Objectifs principaux

| Objectif | Description |
|----------|-------------|
| **O1** | Permettre aux étudiants connectés de **publier** des documents **publics** (visibles par tous les étudiants) ou **privés** (accès par **code** généré). |
| **O2** | Classer et filtrer les documents entre étudiants par **catégorie** et par **mots-clés** (recherche). |
| **O3** | Sécuriser l’accès aux documents privés et aux API sensibles (**JWT**, rôles). |
| **O4** | Offrir aux administrateurs la **validation des inscriptions**, la **gestion des catégories**, la **modération des ressources** déposées sur la plateforme classique, et la **liste / suppression des comptes étudiants**. |
| **O5** | Permettre la **réinitialisation du mot de passe** étudiant par **lien envoyé par e-mail**. |

---

## 2. Périmètre fonctionnel

### 2.1 Hors périmètre (page d’accueil `/` côté étudiant)

La page d’accueil **`/`** ne contient **plus** la consultation publique des ressources catalogue, ni le formulaire « Ajouter un document » vers la file d’attente admin, ni la barre de recherche catalogue. Ces éléments peuvent rester disponibles côté **API** et **administration** pour la modération des ressources « officielles ».

### 2.2 Acteurs

| Acteur | Description |
|--------|-------------|
| **Visiteur** | Peut accéder à l’accueil, à la connexion / inscription ; ne voit pas le bloc « Documents entre étudiants » sans compte **étudiant** validé. |
| **Étudiant** | Compte `users` avec `role = student` et `account_status = approved`. Accès à la page principale de partage entre pairs. |
| **Administrateur** | Compte `users` avec `role = admin`. Accès au dashboard admin. |

---

## 3. Exigences fonctionnelles détaillées

### 3.1 Inscription et authentification étudiant

- **Email académique** obligatoire (format contrôlé : terminaison **`.ac.ma`**).
- Parcours d’inscription avec **vérification par e-mail** (lien à durée limitée) puis formulaire ; le compte n’est **créé** qu’après **approbation** par un administrateur (`student_pending_registrations` → `users`).
- **Connexion** : email + mot de passe ; JWT (durée typique 24 h).
- **Mot de passe oublié** : saisie de l’email académique → envoi d’un **lien** (SMTP configurable) vers une page de **nouveau mot de passe** ; jeton à durée limitée (`STUDENT_PASSWORD_RESET_TTL_MINUTES`, défaut 60 min).

### 3.2 Espace « Documents entre étudiants » (page `/`)

**Publication**

- Champs : **titre**, **catégorie** (liste issue des catégories en base), **visibilité** (public / privé), **fichier**.
- Types de fichiers autorisés (côté serveur / upload) : PDF, Word, images (extensions alignées sur la configuration Multer du projet).
- Taille maximale des fichiers : **10 Mo** (paramétrage actuel Multer).
- **Public** : document listé pour tous les étudiants connectés.
- **Privé** : génération d’un **code d’accès** affiché une fois après publication ; les autres étudiants saisissent le code pour **vérifier** puis **télécharger** (avec authentification).

**Consultation des documents publics**

- **Recherche** par texte (titre, nom de fichier, nom de catégorie) déclenchée par bouton **Recherche** (ou touche Entrée).
- **Filtre par catégorie** (liste déroulante « Toutes les catégories » ou une catégorie précise) ; changement de catégorie met à jour la liste.
- Affichage : titre, fichier, **catégorie**, auteur, date ; actions **télécharger** ; pour les **PDF**, bouton **voir** (aperçu dans le navigateur, avec en-tête d’authentification pour l’API).

**Documents privés (code)**

- Saisie du **code** + bouton **Vérifier** ; affichage des métadonnées puis **téléchargement** (et aperçu PDF si applicable, selon les règles d’accès API).

### 3.3 Administration (`/pages/admin.html`)

- **Documents en attente** (ressources catalogue) : liste, **approuver**, **supprimer**.
- **Comptes étudiants en attente** : liste des demandes, bouton **Approuver** (création du compte dans `users`).
- **Tous les étudiants enregistrés** : tableau (nom, email, statut) ; **suppression** d’un étudiant avec confirmation (suppression des documents partagés étudiants et des ressources déposées par cet utilisateur, puis suppression du compte).
- **Gestion des catégories** : ajout et suppression de catégories.
- **Statistiques** : non présentes dans l’interface admin actuelle (section retirée).

### 3.4 Ressources catalogue (back-office / API)

- Les routes **ressources** (liste publique filtrée, upload avec statut `pending`, approbation admin, téléchargement, like, prévisualisation PDF) restent disponibles pour la **cohérence métier** et l’**admin**, même si elles ne sont plus exposées sur la page d’accueil étudiant simplifiée.

---

## 4. Exigences non fonctionnelles

| Domaine | Exigence |
|---------|----------|
| **Sécurité** | Mots de passe hachés (bcrypt) ; JWT pour les routes protégées ; pas d’exposition des secrets dans le dépôt (`.env` hors Git). |
| **Confidentialité** | Messages génériques pour « mot de passe oublié » afin de ne pas révéler l’existence d’un compte. |
| **Performance** | Volumes modérés (usage pédagogique) ; pas d’exigence de scalabilité horizontale dans ce cahier des charges. |
| **Exploitabilité** | Variables d’environnement pour la base PostgreSQL, JWT, SMTP, URL de base de l’application (`APP_BASE_URL` pour les liens dans les e-mails). |
| **Compatibilité client** | Navigateurs récents ; JavaScript activé ; popups autorisées pour l’aperçu PDF en mode authentifié. |

---

## 5. Architecture technique (référence)

| Couche | Technologie |
|--------|-------------|
| **Frontend** | HTML5, CSS, **Bootstrap 5**, **Font Awesome**, JavaScript (sans framework SPA). |
| **Backend** | **Node.js**, **Express** 5.x. |
| **Base de données** | **PostgreSQL** (driver `pg`). |
| **Auth** | **JWT** (`jsonwebtoken`), **bcryptjs**. |
| **Fichiers** | **Multer** (stockage disque sous `server/uploads`). |
| **E-mail** | **Nodemailer** (ex. Gmail avec mot de passe d’application). |

### 5.1 Principales routes API (non exhaustif)

- `/api/auth/*` — inscription, login, mot de passe oublié / reset étudiant, login admin.
- `/api/categories` — CRUD (lecture publique ; écriture admin).
- `/api/resources/*` — ressources catalogue (dont `pending`, approbation, téléchargement, vue PDF).
- `/api/student-documents/*` — documents entre étudiants (liste, upload, téléchargement, vue PDF, résolution code privé).
- `/api/admin/*` — étudiants en attente, approbation, **liste et suppression des étudiants**, approbation ressources.

### 5.2 Données principales (entités logiques)

- **users** — comptes (étudiant / admin), statut de compte étudiant.
- **categories** — catégories partagées (ressources catalogue + documents entre étudiants).
- **resources** — ressources catalogue (statut, catégorie, uploader).
- **student_shared_documents** — documents entre étudiants (visibilité, code, **category_id**).
- **student_pending_registrations**, **student_signup_tokens**, **student_password_reset_tokens** — flux inscription et reset mot de passe.

---

## 6. Livrables et critères d’acceptation (synthèse)

| ID | Critère d’acceptation |
|----|------------------------|
| A1 | Un étudiant approuvé peut publier un document **public** avec une **catégorie** et le retrouver dans la liste filtrée. |
| A2 | Un étudiant peut publier un document **privé** et un autre étudiant peut le récupérer **uniquement** avec le **code** + session valide. |
| A3 | La **recherche** et le **filtre catégorie** sur les documents publics fonctionnent sans erreur console. |
| A4 | L’admin peut **approuver** une inscription, **lister** tous les étudiants et **supprimer** un étudiant avec mise à jour de la liste. |
| A5 | Le **mot de passe oublié** envoie un e-mail (si SMTP configuré) ou fournit un lien de test en mode développement documenté. |
| A6 | Le serveur démarre avec `npm start` et la connexion PostgreSQL est vérifiée au lancement (sauf `SKIP_DB_CHECK` pour cas particuliers). |

---

## 7. Évolutions possibles (hors périmètre actuel)

- Ré-affichage du catalogue ressources sur une page dédiée `/ressources` pour les étudiants.
- Pagination et quotas par utilisateur.
- Journal d’audit admin.
- Internationalisation (i18n) au-delà du français.

---

*Document rédigé pour servir de référence fonctionnelle et technique au projet ; il doit être mis à jour lors des évolutions majeures du code ou du métier.*
