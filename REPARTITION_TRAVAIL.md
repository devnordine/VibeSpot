# VibeSpot - Répartition du travail (TP4 / TP5 / TP6)

On suit le plan d'exécution du PDF "Architecture et Plan d'Exécution - VibeSpot". On a découpé par fonctionnalité : chacun fait le backend, le frontend et les tests de sa partie, ce qui évite de modifier les mêmes fichiers.

- **Personne A - Noa** : Spots & Carte
- **Personne B - Noureddine** : Social, Partage & Listes

---

## Personne A - Spots & Carte (Noa)

| Mission | À faire | État |
|---|---|---|
| M1 | `spot.model.ts`, `SpotService` (signals, filtres, upload) et ses tests. Socle : routes VibeSpot, barre de navigation, suppression de tout le code audio (`tracks`) | ✅ fait (branche `devnoa`) |
| M2 | `explore-page` : écran partagé liste / carte, carte Leaflet avec marqueurs par humeur, recherche et filtres (humeur, catégorie, budget, rayon), sections "Récemment ajoutés" et "Tendance", bouton "Tracer l'itinéraire". `spot-form-modal` : création d'un spot avec choix du point sur la carte et upload de plusieurs photos | à faire |
| M3 | `spot-detail-page` : galerie photo, note, score d'ambiance, affluence, budget, formulaire d'avis, ajout à une liste | à faire |
| M4 | Tests des composants explore / détail / modale, captures de la carte et des filtres | à faire |

## Personne B - Social, Partage & Listes (Noureddine)

| Mission | À faire |
|---|---|
| M1 (backend) | Routes manquantes dans `app.js` : `GET /api/users/search?q=`, `POST /api/friends/request/:userId`, `PATCH /api/friends/respond/:requestId`, `DELETE /api/friends/:friendId` (qui retire aussi l'ami des `sharedWith`), `PATCH /api/spots/:id/share` (vérifier que c'est le propriétaire), `GET /api/feed`. Ajouter `visibility` (PUBLIC / FRIENDS / PRIVATE) et `sharedWith` au modèle Spot, `friends` et `friendRequests` au modèle User, et filtrer `GET /api/spots` selon ces droits. Mettre à jour `API_CONTRACT.md` |
| M1 (frontend) | `friend.model.ts`, `custom-list.model.ts`, `SocialService`, `ListService` et leurs tests |
| M3 | `social-page` (fil d'activité, recherche d'amis, invitations), `lists-page` (listes collaboratives, glisser-déposer), `profile-page` (badges, onglets Mes spots / Partagés avec moi / Favoris, recommandations), et un composant `share-panel` ("Stopper le partage") que je placerai dans la fiche spot |
| M4 | Tests de révocation d'accès et du parcours social |

## Ensemble

- `REPORT.md`, build de production final, vérifier que tous les tests passent.
- Relire le rapport IA de l'autre.

---

## Ce que tu dois savoir avant de commencer (B)

1. **Récupère ma branche** : le frontend a changé (plus de `tracks`, nouvelles routes). Merge `devnoa` dans ta branche ou attends que ce soit sur `main`.
2. **Les routes de tes pages existent déjà** dans `frontend-starter/src/app/routes.ts`. `/social` et `/lists` pointent pour l'instant vers une page provisoire (`placeholder-page`). Quand tes composants sont prêts, tu as juste à changer le `loadComponent`, par exemple :
   ```ts
   loadComponent: () => import('./components/social-page/social-page').then((m) => m.SocialPageComponent),
   ```
   `/profile` utilise encore l'ancienne page profil, à toi de la refaire.
3. **Bug dans le backend à corriger** : dans `GET /api/spots`, quand on envoie `lat` et `lng`, le filtre contient `$nearSphere`, puis on appelle `Spot.countDocuments(filter)`. MongoDB refuse `$nearSphere` dans un `countDocuments`, donc la recherche par rayon renvoie une erreur 500. Solution possible : utiliser `$geoWithin: { $centerSphere: [[lng, lat], maxDistance / 6378100] }` à la place (ça marche avec le comptage). J'en ai besoin pour le filtre de rayon de la carte en Mission 2.
4. **J'ai besoin du fichier `backend/.env`** (identifiants MongoDB Atlas) pour lancer le backend et faire les captures Network. Envoie-le-moi en privé, **pas sur Git**.
5. **Conventions frontend** (comme dans les TP précédents et le `CLAUDE.md`) : composants standalone, `inject()`, Signals, `@if` / `@for`, services dans `src/app/shared/services`, modèles dans `src/app/shared/models`, pas de `any`, pas de `console.log`.
6. **Tests** : le projet utilise **Vitest**, pas Jasmine. Il faut importer `describe`, `it`, `expect` depuis `'vitest'` et utiliser `toBe(true)` (pas `toBeTrue()`). Commande : `npx ng test --watch=false`.

---

## Rapport IA

- Un seul fichier : `RAPPORT_IA_TP456.md` à la racine. J'ai déjà écrit l'en-tête et ma Mission 1.
- Même format que `RAPPORT_IA_MODELE.md`, une section par prompt avec les 8 rubriques : objectif, prompt, plan proposé par l'agent, vérifications, erreurs ou propositions rejetées, fichiers, preuve de fonctionnement, ce que je sais expliquer sans l'agent.
- Mets ton nom dans le titre de tes sections, par exemple : `## TP4 - Mission 1 : Social et partage (partie B - Noureddine)`.
- Captures dans `livrables/TP4/capture_ecran_TP4/`, nommées `capture_<mission>_<sujet>.png` (ex. `capture_M1_tests_social_service.png`). On met surtout des captures des tests qui passent, du build et de l'onglet Network, pas des captures des prompts.
- Pense à noter ta consommation de tokens.
