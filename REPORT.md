# VibeSpot - Rapport technique (TP4 / TP5 / TP6)

**Binôme :** PISTONE Noa (partie A : spots et cartographie) · BRAHMIA Noureddine (partie B : social, partage et listes)
**Stack :** Angular 22 (standalone, Signals) · Node.js / Express · MongoDB Atlas (Mongoose) · Leaflet · Angular CDK · Vitest

---

## 1. Le projet

VibeSpot permet de trouver un lieu selon son humeur (travailler au calme, faire la fête, prendre des photos...), de le voir sur une carte, de le noter, de l'ajouter à des listes et de le partager avec ses amis.

Le projet part du starter des TP1 à TP3 (*Guitar Practice Cloud*). On a gardé l'authentification JWT, l'intercepteur et le guard, et remplacé tout le domaine audio par le domaine "spots".

## 2. Fonctionnalités

| Vue | Fonctionnalités | Partie |
|---|---|---|
| `/explore` | Écran partagé liste / carte, recherche texte, filtres humeur / catégorie / budget, "Autour de moi" avec rayon de 1 à 50 km, sections Tendance et Récents, favoris, création de spot (point sur la carte, jusqu'à 5 photos) | A |
| `/spots/:id` | Galerie photo, note, affluence, budget, mini-carte, itinéraire, avis (ajout / suppression), ajout de photo, ajout à une liste, panneau de partage ACL (`PUBLIC` / `FRIENDS` / `PRIVATE` et bouton « Stopper le partage ») pour le créateur | A (+ panneau B) |
| `/social` | Fil d'activité chronologique des amis, recherche d'utilisateurs en temps réel (`debounceTime`), gestion des invitations (envoyer / accepter / refuser), retrait d'un ami avec révocation automatique des partages privés | B |
| `/lists` | Vue maître-détail des listes collaboratives, création publique/privée, gestion des collaborateurs, réordonnancement des étapes par glisser-déposer (`@angular/cdk/drag-drop`) | B |
| `/profile` | Édition du profil et des humeurs favorites (`tastes`), vitrine des badges débloqués, onglets Mes spots / Partagés avec moi / Favoris / Recommandés | B |

## 3. Architecture

```
frontend-starter/src/app/
├── components/   explore-page, spot-card, spot-map, spot-form-modal, spot-detail-page   (A)
│                 social-page, share-panel, lists-page, profile-page                     (B)
├── shared/
│   ├── models/    spot.model (A) · friend.model, custom-list.model (B) · user, page
│   ├── services/  spot.service (A) · social.service, list.service (B) · auth.service
│   │              + suites *.spec.ts et revocation-flow.spec.ts (parcours ACL E2E)
│   ├── guards/ interceptors/ utils/ testing/
└── routes.ts     toutes les pages en lazy loading, protégées par authGuard

backend/
├── src/
│   ├── app.js        routes Express (37 routes)
│   └── models/       User, Spot, CustomList, Track (ancien TP)
└── test/
    └── social-acl.test.js   tests d'intégration Express (node:test + assert)
```

**Principes suivis dans tout le frontend :** composants standalone, `inject()` à la place des constructeurs, état dans des Signals (`signal`, `computed`, `linkedSignal`) exposés en lecture seule (`asReadonly()`) par les services, flux de contrôle `@if` / `@for` / `@switch` / `@empty`, aucun `any` ni style en ligne.

**Flux principaux :**
- **Exploration (A) :** un filtre change → `SpotService.updateFilters()` → `load()` annule la requête précédente et appelle `GET /api/spots` → le serveur applique le filtre d'accès (ACL), les filtres et la pagination → les Signals du service sont mis à jour → la liste et la carte se redessinent.
- **Social, Partage & Listes (B) :**
  - *Recherche d'amis :* saisie dans `SocialPageComponent` → `toObservable()` + `debounceTime(300)` + `distinctUntilChanged()` + `switchMap()` → `GET /api/users/search?q=` → mise à jour du Signal `searchResults` avec le statut relationnel (`NONE`, `FRIEND`, `PENDING_SENT`, `PENDING_RECEIVED`).
  - *Révocation & Listes :* action sur `SharePanelComponent` (`PATCH /api/spots/:id/share`) ou glisser-déposer `CdkDropList` (`moveItemInArray` + `PUT /api/lists/:id/reorder`) → persistance MongoDB et synchronisation immédiate des Signals locaux.

## 4. Données et API

- **Spot :** titre, catégorie, humeurs, budget (1 à 3), position GeoJSON (index `2dsphere`), photos, avis, note moyenne, affluence, `visibility` (`PUBLIC` / `FRIENDS` / `PRIVATE`) et `sharedWith` (liste blanche d'identifiants d'amis autorisés).
- **User :** profil (`name`, `bio`, `avatar`), humeurs favorites (`tastes`), favoris (`favorites`), badges débloqués (`badges`), graphe social bidirectionnel (`friends`) et demandes en attente (`friendRequests`).
- **CustomList :** nom, description, visibilité (`isPublic`), propriétaire (`ownerId`), collaborateurs autorisés (`collaborators`) et tableau ordonné des lieux (`spots`).

Le contrat complet (méthodes, paramètres, réponses, erreurs) est dans [`API_CONTRACT.md`](API_CONTRACT.md).

## 5. Sécurité

- **JWT** ajouté par l'intercepteur (`auth` obligatoire et `optionalAuth` sur les routes mixtes) ; une réponse `401` déconnecte et renvoie au login.
- **Contrôle d'accès côté serveur (ACL) :** le filtre de visibilité (`buildSpotAccessFilter`) est appliqué directement dans la requête MongoDB (pas après coup en JavaScript), garantissant la justesse de la pagination et des totaux. Un spot privé non partagé ou dont l'accès a été révoqué renvoie **`403 Forbidden`**.
- **Révocation ciblée et en cascade :** seul le créateur (`createdBy`) peut modifier, supprimer ou partager un spot (`PATCH /api/spots/:id/share`). Retirer un ami (`DELETE /api/friends/:friendId`) supprime l'amitié dans les deux sens et purge automatiquement ses accès dans `Spot.sharedWith` et `CustomList.collaborators`.
- **Permissions sur les listes :** seul le propriétaire (`ownerId`) gère la visibilité, les collaborateurs et la suppression d'une liste ; les collaborateurs peuvent ajouter, retirer et réordonner les étapes.
- **Photos :** type et taille vérifiés côté client pour le confort, et par Multer côté serveur pour la sécurité.
- **Pas d'injection HTML :** les popups de la carte sont construites avec `textContent` ; un test le vérifie avec un titre contenant du HTML.
- **Secrets :** `backend/.env` n'est jamais versionné.

## 6. Lancer le projet

1. **Backend :** créer `backend/.env` avec trois variables (voir [`ATLAS_SETUP.md`](ATLAS_SETUP.md)) :
   ```
   MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<base>?appName=Cluster0
   JWT_SECRET=<une longue chaîne aléatoire>
   PORT=3000
   ```
   puis `cd backend && npm install && npm start`. Vérification : `http://localhost:3000/api/health`.
2. **Frontend :** `cd frontend-starter && npm install && npm start`, puis ouvrir `http://localhost:4200`. Le proxy redirige `/api` et `/uploads` vers le backend.
3. **Tests automatisés :**
   - Frontend : `cd frontend-starter && npx ng test --watch=false`
   - Backend (intégration ACL) : `node --test backend/test/social-acl.test.js`
4. **Compte de démo :** `demo@example.com` / `Demo1234!`.

## 7. Tests et qualité

| Indicateur | Résultat |
|---|---|
| Tests unitaires Frontend (Vitest, `npx ng test --watch=false`) | **76 / 76** au vert, 16 fichiers (dont `revocation-flow.spec.ts`) |
| Tests d'intégration Backend (`node --test backend/test/social-acl.test.js`) | **2 / 2** au vert (blocage `403` et purge en cascade) |
| Build de production (`npx ng build`) | OK, sans avertissement |
| Chargement initial | 96 kB compressés ; Leaflet et chaque page chargés à la demande |
| Dépendances livrées (`npm audit --omit=dev`) | 0 faille |
| Couverture des lignes (partie A) | de 74 % à 100 % selon les fichiers |

Les tests unitaires n'utilisent jamais le vrai backend : `HttpTestingController` intercepte les requêtes côté Angular (y compris le scénario complet partage privé → révocation `PATCH /api/spots/:id/share` → rejet `403 Forbidden` → suppression d'ami `DELETE /api/friends/:friendId` dans `revocation-flow.spec.ts`), et `node:test` avec `mock.method` valide le comportement des contrôleurs Express côté serveur. Les fonctionnalités ont aussi été vérifiées manuellement sur la vraie base MongoDB Atlas (captures réseau DevTools archivées dans `livrables/TP4-5-6/`).
Preuves visuelles DevTools archivées dans `livrables/TP4-5-6/Capture_ecran/` :
- **Révocation d'accès ACL (`PATCH /api/spots/:id/share` → `403 Forbidden`) :** `capture_revocation_403.png`
- **Listes collaboratives et glisser-déposer (`PUT /api/lists/:id/reorder`) :** `capture_lists_dragdrop.png`
- **Suppression d'ami et purge en cascade (`DELETE /api/friends/:friendId`) :** `capture_delete_friend_cascade.png`

## 8. Problèmes rencontrés et corrigés

| Problème | Cause | Correction |
|---|---|---|
| Recherche par rayon en erreur 500 | `$nearSphere` interdit dans `countDocuments` | `$geoWithin` + `$centerSphere` |
| Déconnexion à chaque F5 | Dépendance circulaire `AuthService` / intercepteur au démarrage | `restoreSession()` appelée par `provideAppInitializer` |
| Page blanche en ouvrant `/spots/:id` directement | `<base href="/">` manquant dans `index.html` | Ajout de la balise |
| Création de spot impossible après la fusion | Routes `POST` / `PUT` / `DELETE /api/spots` supprimées par erreur | Routes rétablies, avec le champ `visibility` |
| Photos du backend invisibles en dev | Le proxy ne redirigeait que `/api` | Ajout de `/uploads` dans `proxy.conf.json` |
| `TypeError: Cannot read properties of undefined (reading 'getItem' / 'setItem')` sous Vitest | Node.js expose un `localStorage` expérimental `undefined` sans `--localstorage-file` | Mock d'`AuthService` par Signals dans les composants et polyfill mémoire `Storage` dans `auth.service.spec.ts` |
| `Cannot find name 'vi'` dans `share-panel.spec.ts` | `tsconfig.spec.json` configure les types globaux Jasmine | Substitution standard de `window.confirm` dans un bloc `try / finally` |

## 9. Limites et pistes

- **Recherche par rayon :** `$geoWithin` ne trie pas par distance. Un tri du plus proche au plus loin demanderait un pipeline `$geoNear`.
- **Score d'ambiance et affluence :** les champs existent mais ne sont pas encore calculés à partir des avis.
- **Notifications temps réel :** l'ajout d'une connexion WebSocket / SSE permettrait de notifier instantanément la réception d'une demande d'ami ou la modification d'une liste collaborative.
- **5 failles connues** dans les outils de développement (`vite`, `@vitest/mocker`) : elles ne sont pas livrées, mais il faudra mettre à jour Vitest.
- **Pas de tests E2E navigateur automatisés** (type Playwright) : les parcours complets ont été vérifiés manuellement et via des tests d'intégration HTTP isolés.
- **`README.md` mentionne un `backend/.env.example`** qui n'existe pas : le contenu attendu est décrit au point 6.

## 10. Répartition et utilisation de l'IA

Chaque membre a développé sa partie sur sa branche (`devnoa`, `devnoureddine`), puis les deux ont été fusionnées sur `main`. L'utilisation de l'IA (prompts, plans, erreurs, vérifications) est détaillée dans :
- [`RAPPORT_IA_TP456.md`](RAPPORT_IA_TP456.md) pour la partie A ;
- [`RAPPORT_IA_MODELE.md`](RAPPORT_IA_MODELE.md), section *Phase 2 (Missions 1 à 4)*, pour la partie B.