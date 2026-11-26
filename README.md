# VibeSpot - Découverte et partage collaboratif de lieux par ambiance

**VibeSpot** est une application web full-stack (Angular 22 · Node.js / Express · MongoDB Atlas) permettant de découvrir, cartographier, noter et partager des lieux selon son humeur (*travail, calme, festif, gourmand, sportif, photo, romantique, nature*), tout en gérant ses cercles d'amis, des accès privés sécurisés (ACL) et des listes collaboratives réordonnables par glisser-déposer.

**Binôme :**
- **PISTONE Noa (Partie A) :** Exploration géospatiale (`2dsphere`), carte interactive Leaflet, recherche multicritère, création de lieux, galerie multi-photos et avis.
- **BRAHMIA Noureddine (Partie B) :** Graphe social (amis et invitations), contrôle d'accès granulaire (`PUBLIC` / `FRIENDS` / `PRIVATE`), révocation immédiate et en cascade, fil d'activité, listes collaboratives Drag & Drop (`@angular/cdk`) et profil/badges.

---

## Prérequis

- **Node.js 22** ou plus récent ;
- Un cluster **MongoDB Atlas** configuré (voir [`ATLAS_SETUP.md`](ATLAS_SETUP.md)) ;
- **Git** et un navigateur web récent.

---

## Installation et démarrage

### 1. Démarrer le backend (`http://localhost:3000`)

Créer le fichier `backend/.env` à la racine du dossier `backend/` avec les variables suivantes :

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<base>?appName=Cluster0
JWT_SECRET=<une_longue_chaine_aleatoire_securisee>
PORT=3000
```

> Ne jamais versionner `backend/.env` ni exposer de secret dans le code frontend.

Installer les dépendances et lancer l'API Express :

```bash
cd backend
npm install
npm start
```

Vérification de santé de l'API : `http://localhost:3000/api/health`.

### 2. Démarrer le frontend (`http://localhost:4200`)

Dans un second terminal :

```bash
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200` (le proxy `proxy.conf.json` redirige automatiquement `/api` et `/uploads` vers `http://localhost:3000`).

- **Compte de démonstration :** `demo@example.com` / `Demo1234!`

---

## Fonctionnalités principales

| Route | Fonctionnalités | Périmètre |
| :--- | :--- | :---: |
| `/explore` | Vue hybride liste / carte Leaflet, filtres par humeur, catégorie et budget, recherche géospatiale *"Autour de moi"* (1 à 50 km), tendances, favoris et création de spot (jusqu'à 5 photos) | A |
| `/spots/:id` | Galerie photo, note moyenne, jauge d'affluence, budget, mini-carte, itinéraire, avis, ajout à une liste et panneau de partage ACL (`PUBLIC` / `FRIENDS` / `PRIVATE` + bouton *« Stopper le partage »*) | A + B |
| `/social` | Fil d'activité des amis (`GET /api/feed`), recherche d'utilisateurs temps réel (`debounceTime`), envoi/acceptation/refus d'invitations et retrait d'ami avec purge en cascade des partages privés | B |
| `/lists` | Carnets d'adresses publics ou privés, gestion des collaborateurs et réordonnancement des étapes par glisser-déposer (`@angular/cdk/drag-drop`) | B |
| `/profile` | Édition du profil et des humeurs favorites, vitrine des badges débloqués et onglets *Mes spots / Partagés avec moi / Favoris / Recommandés* | B |

---

## Tests et build de production

- **Tests unitaires Frontend (Vitest - 76 tests / 16 fichiers) :**
  ```bash
  cd frontend-starter
  npm test -- --watch=false
  ```
- **Tests d'intégration Backend ACL (`node:test` - 2 tests) :**
  ```bash
  node --test backend/test/social-acl.test.js
  ```
- **Build de production Angular :**
  ```bash
  cd frontend-starter
  npm run build
  ```

---

## Architecture du dépôt

```text
VibeSpot/
├── backend/
│   ├── src/
│   │   ├── app.js              # API REST Express (37 routes, JWT, ACL, Multer)
│   │   └── models/             # Schémas Mongoose (User, Spot, CustomList)
│   └── test/
│       └── social-acl.test.js  # Tests d'intégration sécurité ACL & cascade
├── frontend-starter/
│   └── src/app/
│       ├── components/         # Composants standalone (explore, spot-detail, social, share-panel, lists, profile...)
│       ├── shared/             # Modèles TS, services réactifs (Signals), guards, intercepteurs, tests *.spec.ts
│       └── routes.ts           # Routage lazy-loaded protégé par authGuard
├── livrables/                  # Captures réseau DevTools, schémas et bilans des TP1 à TP6
├── API_CONTRACT.md             # Contrat d'interface REST complet (endpoints, requêtes, réponses, erreurs)
├── REPORT.md                   # Rapport technique global du projet (architecture, sécurité, tests, bilan)
├── RAPPORT_IA_TP456.md         # Journal d'usage de l'IA - Partie A
└── RAPPORT_IA_MODELE.md        # Journal d'usage de l'IA - TP1 à TP3 et Partie B (Missions 1 à 4)
```

---

## Documentation et livrables

- [`REPORT.md`](REPORT.md) : rapport technique détaillé du projet (architecture, sécurité ACL, bilan des tests et limites) ;
- [`API_CONTRACT.md`](API_CONTRACT.md) : spécification exhaustive des routes API et des structures JSON ;
- [`ATLAS_SETUP.md`](ATLAS_SETUP.md) : guide de configuration de la base MongoDB Atlas ;
- [`RAPPORT_IA_TP456.md`](RAPPORT_IA_TP456.md) & [`RAPPORT_IA_MODELE.md`](RAPPORT_IA_MODELE.md) : comptes rendus méthodologiques d'utilisation de l'IA.