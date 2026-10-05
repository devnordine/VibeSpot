# Rapport d'usage de l'IA — TP1

## Informations générales
- **Étudiant :** Nordine (travail individuel)
- **Modèle d'IA utilisé :** Cursor Agent / Claude 3.5 Sonnet (avec support ponctuels de Gemini pour le diagnostic d'environnement)
- **Mesure de la consommation de tokens :** Suivi effectué via l'interface de l'éditeur (panneau des statistiques d'usage et compteurs de contexte).
- **Critères de sélection du modèle :** Utilisation d'un modèle orienté ingénierie logicielle (Claude 3.5 Sonnet) pour la rigueur sur l'architecture Angular moderne (standalone, inject, Signals) et les règles de sécurité Web.

---

## Mission 0 — Cartographie et Flux d'authentification

### 1. Objectif
Identifier l'architecture applicative sans modifier le code : repérer le composant racine, les routes, l'injection de `HttpClient`, la distinction entre routes publiques et protégées (`API_CONTRACT.md`), et formaliser le schéma du flux de connexion.

### 2. Prompt principal
> « Analyse l'arborescence et le code existant du projet Guitar Practice Cloud. Identifie le composant racine, le fichier de routage, la configuration du client HTTP et le rôle de l'intercepteur. Produis les étapes du flux de connexion complet lors du clic sur "Se connecter", depuis le composant Angular jusqu'à MongoDB via Express. »

### 3. Plan proposé par l'agent
1. Cartographier le composant racine (`src/app/components/app/app.ts`), le bootstrap (`src/main.ts`) et la configuration des routes (`src/app/routes.ts`).
2. Vérifier l'injection globale de `provideHttpClient(withInterceptors([authInterceptor]))`.
3. Tracer le flux d'authentification : Clic UI → `login-page.ts` → `AuthService.login()` → appel HTTP POST via Proxy → route Express `/api/auth/login` → vérification du mot de passe haché dans `User.js` via bcrypt → génération du token JWT → retour client.
4. Structurer les étapes logiques pour tracer le diagramme de flux complet.

### 4. Vérifications réalisées
- Vérification visuelle des correspondances de ports dans `proxy.conf.json` (`/api` redirigé vers `http://localhost:3000`).
- Réalisation du diagramme de flux sous draw.io représentant le cycle de vie de la requête et la séparation claire client / serveur.

### 5. Erreurs ou propositions rejetées
- Proposition de l'agent d'utiliser l'ancienne configuration par module (`NgModule` et `HTTP_INTERCEPTORS`). Rejetée pour rester sur les composants Standalone et `HttpInterceptorFn`.

### 6. Fichiers effectivement inspectés / modifiés
- `frontend-starter/src/main.ts`
- `frontend-starter/src/app/routes.ts`
- `frontend-starter/proxy.conf.json`
- `backend/src/app.js`
- **Ajout livrable :** `livrables/TP1/schema_diagramme_flux_process.drawio.png`

### 7. Preuve de fonctionnement
- Diagramme du processus d'authentification :  
  `![Schéma de flux](livrables/TP1/schema_diagramme_flux_process.drawio.png)`

### 8. Ce que je sais expliquer sans l'agent
- Pourquoi Angular ne dialogue jamais directement avec MongoDB : la base requiert des identifiants secrets et une connexion réseau directe impossible depuis le navigateur ; l'API Express sert de barrière de validation et de sécurité.
- Le rôle d'aiguillage du proxy de développement (`proxy.conf.json`) pour éviter les blocages CORS entre le port 4200 (Angular) et le port 3000 (API Express).

---

## Mission 1 — Inscription, Connexion et Profil

### 1. Objectif
Implémenter la gestion de session utilisateur réactive et sécurisée avec Angular Signals, formulaires réactifs avec validation, synchronisation `localStorage`, gestion des retours 401 et mise à jour du profil via `PUT /api/users/me`.

### 2. Prompt principal
> « Avec le même procédé d'analyse du code existant, effectue les tâches suivantes avec la dernière syntaxe d'Angular +18 : 
> - le stockage sécurisé du JWT côté navigateur sans l'afficher dans les logs ;
> - la mise à jour du Signal currentUser ;
> - la redirection après connexion ou inscription ;
> - la déconnexion avec nettoyage du token et de l'état utilisateur ;
> - le chargement du profil avec GET /api/users/me ;
> - la modification du nom avec PUT /api/users/me ;
> - la gestion d'une réponse 401 avec retour vers /login ;
> - l'utilisation de inject() sans constructeurs obsolètes ;
> - le respect de la séparation composant, service et API. »

### 3. Plan proposé par l'agent
1. **`auth.service.ts` :** Implémentation des Signals `token` (initialisé via `localStorage`) et `currentUser`. Exposition des méthodes `login()`, `register()`, `profile()`, `update()` et `logout()`.
2. **`auth.interceptor.ts` :** Ajout de l'en-tête `Authorization: Bearer <token>` sur les requêtes sortantes et écoute des erreurs via `catchError` : redirection vers `/login` et appel à `logout()` en cas de code 401.
3. **`app.html` & `app.ts` :** Rendre la barre de navigation réactive : affichage conditionnel (`@if`) du bouton « Déconnexion » si l'utilisateur est authentifié.
4. **`profile-page` :** Chargement automatique des données du profil à l'initialisation et mise à jour réactive du nom.
5. **`login-page` & `register-page` :** Validation stricte des formulaires réactifs avec blocage des envois si invalides.

### 4. Vérifications réalisées
- Test de tentative de connexion avec mot de passe erroné : réception du code HTTP 401 Unauthorized dans l'onglet Network et affichage immédiat de l'erreur dans l'UI sans recharger la page.
- Test de connexion réussie avec le compte de démo (`demo@example.com` / `Demo1234!`) : transition vers `/tracks`, persistance du token dans `localStorage` (clé `gpc_token`) et affichage du bouton « Déconnexion ».
- Test de déconnexion : vidage instantané du `localStorage`, réinitialisation des Signals et redirection vers l'écran de login.

### 5. Erreurs ou propositions rejetées
- L'agent a suggéré l'usage d'un `constructor()` pour initialiser la session. Rejeté pour privilégier l'initialisation moderne d'Angular par `inject()` et initialisation directe de propriétés.
- Absence initiale de l'interception de l'erreur 401 dans `auth.interceptor.ts` : corrigée en ajoutant l'opérateur RxJS `catchError`.
- Proposition d'afficher les retours d'API avec `console.log()` : refusée pour éviter la fuite du token JWT dans la console DevTools.

### 6. Fichiers effectivement modifiés
- `frontend-starter/src/app/shared/services/auth.service.ts`
- `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts`
- `frontend-starter/src/app/components/app/app.ts`
- `frontend-starter/src/app/components/app/app.html`
- `frontend-starter/src/app/components/profile-page/profile-page.ts`
- `frontend-starter/src/app/components/profile-page/profile-page.html`
- `frontend-starter/src/app/components/login-page/login-page.ts`
- `frontend-starter/src/app/components/register-page/register-page.ts`
- `livrables/TP1/Fichier_réponse_question_Mission1.md`
- `livrables/TP1/REPONSE_SIGNAL_LOCALSTORAGE.md`

### 7. Preuve de fonctionnement
- **Connexion réussie et chargement des pistes :**  
  `![Authentification Réussie](livrables/TP1/capture_ecran_TP1/Capture_authentification_reussie.png)`
- **Échec de connexion et gestion d'erreur :**  
  `![Erreur Authentification](livrables/TP1/capture_ecran_TP1/Capture_erreur_authentification.png)`

### 8. Ce que je sais expliquer sans l'agent
- **Différence Signal vs localStorage :** Le `localStorage` est une API synchrone de persistance sur disque (le token y survit à la fermeture de l'onglet), mais il n'est pas réactif. Le `Signal` est un état réactif en mémoire vive qui notifie les composants dès qu'il change pour recalculer le DOM. Dans notre application, ils travaillent en synergie.
- **Trajet de la mise à jour du profil :** `profile-page.ts` appelle `AuthService.update()`, émettant un `PUT /api/users/me`. L'intercepteur injecte l'en-tête Bearer. Côté Express, le middleware vérifie le token et extrait l'ID utilisateur, `User.findByIdAndUpdate()` met à jour le document MongoDB, et la réponse permet de mettre à jour le Signal `currentUser` côté Angular.