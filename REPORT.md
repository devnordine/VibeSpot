# VibeSpot - Rapport technique (TP4 / TP5 / TP6)

**Binôme :** PISTONE Noa (partie A : spots et cartographie) · BRAHMIA Noureddine (partie B : social, partage et listes)
**Stack :** Angular 22 (standalone, Signals) · Node.js / Express · MongoDB Atlas (Mongoose) · Leaflet · Vitest

---

## 1. Le projet

VibeSpot permet de trouver un lieu selon son humeur (travailler au calme, faire la fête, prendre des photos...), de le voir sur une carte, de le noter, de l'ajouter à des listes et de le partager avec ses amis.

Le projet part du starter des TP1 à TP3 (*Guitar Practice Cloud*). On a gardé l'authentification JWT, l'intercepteur et le guard, et remplacé tout le domaine audio par le domaine "spots".

## 2. Fonctionnalités

| Vue | Fonctionnalités | Partie |
|---|---|---|
| `/explore` | Écran partagé liste / carte, recherche texte, filtres humeur / catégorie / budget, "Autour de moi" avec rayon de 1 à 50 km, sections Tendance et Récents, favoris, création de spot (point sur la carte, jusqu'à 5 photos) | A |
| `/spots/:id` | Galerie photo, note, affluence, budget, mini-carte, itinéraire, avis (ajout / suppression), ajout de photo, ajout à une liste, panneau de partage pour le créateur | A (+ panneau B) |
| `/social` | Fil d'activité des amis, recherche d'utilisateurs, invitations (envoyer / accepter / refuser), retrait d'un ami | B |
| `/lists` | Listes collaboratives, collaborateurs, réordonnancement par glisser-déposer | B |
| `/profile` | Infos et goûts, badges, onglets Mes spots / Partagés avec moi / Favoris / Recommandés | B |

## 3. Architecture

```
frontend-starter/src/app/
├── components/   explore-page, spot-card, spot-map, spot-form-modal, spot-detail-page   (A)
│                 social-page, share-panel, lists-page, profile-page                     (B)
├── shared/
│   ├── models/    spot.model (A) · friend.model, custom-list.model (B) · user, page
│   ├── services/  spot.service (A) · social.service, list.service (B) · auth.service
│   ├── guards/ interceptors/ utils/ testing/
└── routes.ts     toutes les pages en lazy loading, protégées par authGuard

backend/src/
├── app.js        routes Express (37 routes)
└── models/       User, Spot, CustomList, Track (ancien TP)
```

**Principes suivis dans tout le frontend :** composants standalone, `inject()` à la place des constructeurs, état dans des Signals (`signal`, `computed`, `linkedSignal`) exposés en lecture seule par les services, flux de contrôle `@if` / `@for`, aucun `any` ni style en ligne.

**Flux d'une recherche :** un filtre change → `SpotService.updateFilters()` → `load()` annule la requête précédente et appelle `GET /api/spots` → le serveur applique le filtre d'accès (ACL), les filtres et la pagination → les Signals du service sont mis à jour → la liste et la carte se redessinent.

## 4. Données et API

- **Spot :** titre, catégorie, humeurs, budget (1 à 3), position GeoJSON (index `2dsphere`), photos, avis, note moyenne, affluence, `visibility` (`PUBLIC` / `FRIENDS` / `PRIVATE`) et `sharedWith`.
- **User :** profil, goûts, favoris, badges, `friends`, `friendRequests`.
- **CustomList :** nom, propriétaire, collaborateurs, spots ordonnés.

Le contrat complet (méthodes, paramètres, réponses, erreurs) est dans [`API_CONTRACT.md`](API_CONTRACT.md).

## 5. Sécurité

- **JWT** ajouté par l'intercepteur ; une réponse 401 déconnecte et renvoie au login.
- **Contrôle d'accès côté serveur :** le filtre de visibilité est appliqué dans la requête MongoDB (pas après coup en JavaScript), sinon la pagination et les totaux seraient faux. Un spot privé non partagé renvoie **403**.
- **Seul le créateur** peut modifier, supprimer ou partager un spot.
- **Retirer un ami** supprime aussi ses accès aux spots privés et aux listes.
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
3. **Compte de démo :** `demo@example.com` / `Demo1234!`.

## 7. Tests et qualité

| Indicateur | Résultat |
|---|---|
| Tests unitaires (Vitest, `npx ng test --watch=false`) | **74 / 74** au vert, 15 fichiers |
| Build de production (`npx ng build`) | OK, sans avertissement |
| Chargement initial | 96 kB compressés ; Leaflet et chaque page chargés à la demande |
| Dépendances livrées (`npm audit --omit=dev`) | 0 faille |
| Couverture des lignes (partie A) | de 74 % à 100 % selon les fichiers |

Les tests n'utilisent jamais le vrai backend : `HttpTestingController` intercepte les requêtes, et les composants enfants lourds (carte, panneau de partage) sont remplacés par des composants vides. Les fonctionnalités ont aussi été vérifiées à la main avec la vraie base Atlas.

## 8. Problèmes rencontrés et corrigés

| Problème | Cause | Correction |
|---|---|---|
| Recherche par rayon en erreur 500 | `$nearSphere` interdit dans `countDocuments` | `$geoWithin` + `$centerSphere` |
| Déconnexion à chaque F5 | Dépendance circulaire `AuthService` / intercepteur au démarrage | `restoreSession()` appelée par `provideAppInitializer` |
| Page blanche en ouvrant `/spots/:id` directement | `<base href="/">` manquant dans `index.html` | Ajout de la balise |
| Création de spot impossible après la fusion | Routes `POST` / `PUT` / `DELETE /api/spots` supprimées par erreur | Routes rétablies, avec le champ `visibility` |
| Photos du backend invisibles en dev | Le proxy ne redirigeait que `/api` | Ajout de `/uploads` dans `proxy.conf.json` |

## 9. Limites et pistes

- **Recherche par rayon :** `$geoWithin` ne trie pas par distance. Un tri du plus proche au plus loin demanderait un pipeline `$geoNear`.
- **Score d'ambiance et affluence :** les champs existent mais ne sont pas encore calculés à partir des avis.
- **5 failles connues** dans les outils de développement (`vite`, `@vitest/mocker`) : elles ne sont pas livrées, mais il faudra mettre à jour Vitest.
- **Pas de tests de bout en bout automatisés** (type Playwright) : les parcours complets ont été vérifiés à la main.
- **`README.md` mentionne un `backend/.env.example`** qui n'existe pas : le contenu attendu est décrit au point 6.

## 10. Répartition et utilisation de l'IA

Chaque membre a développé sa partie sur sa branche (`devnoa`, `devnoureddine`), puis les deux ont été fusionnées. L'utilisation de l'IA (prompts, plans, erreurs, vérifications) est détaillée dans :
- [`RAPPORT_IA_TP456.md`](RAPPORT_IA_TP456.md) pour la partie A ;
- [`RAPPORT_IA_MODELE.md`](RAPPORT_IA_MODELE.md), section *Phase 2*, pour la partie B.
