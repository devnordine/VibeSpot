# Contrat HTTP — API VibeSpot

Base des endpoints : `/api`.
Sauf pour l'inscription, la connexion et la consultation publique, envoyer le jeton JWT dans l'en-tête :
`Authorization: Bearer <token>`

---

## 1. Vue d'ensemble des routes

###  Authentification & Profil Utilisateur

| Méthode | Route | Description | Auth | Requête (Body / Query) | Réponse |
|---|---|---|---|---|---|
| `GET` | `/health` | Vérification de l'état du serveur | Non | - | `200 { status: "ok", app: "VibeSpot API" }` |
| `POST` | `/auth/register` | Inscription d'un nouvel utilisateur | Non | `{ name, email, password, tastes? }` | `201 { token, user: User }` |
| `POST` | `/auth/login` | Connexion utilisateur | Non | `{ email, password }` | `200 { token, user: User }` |
| `GET` | `/users/me` | Profil connecté (badges, goûts, favoris) | **JWT** | - | `200 User` |
| `PUT` | `/users/me` | Mise à jour du profil (nom, bio, avatar, goûts) | **JWT** | `{ name?, bio?, avatar?, tastes? }` | `200 User` |
| `GET` | `/users/me/favorites` | Liste des spots mis en favoris par l'utilisateur | **JWT** | - | `200 Spot[]` |

---

###  Spots (Lieux par Humeur, Carte, Filtres & Populaires)

| Méthode | Route | Description | Auth | Paramètres / Requête | Réponse |
|---|---|---|---|---|---|
| `GET` | `/spots` | Recherche et liste paginée avec filtres | Non | `?page=1&limit=10&mood=...&category=...&budget=...&city=...&search=...&sort=...` | `200 Page<Spot>` |
| `GET` | `/spots/map` | Données allégées pour les marqueurs de la carte | Non | `?mood=...&category=...&city=...` | `200 Marker[]` |
| `GET` | `/spots/trending` | Spots les plus populaires / tendance | Non | `?limit=6` | `200 Spot[]` |
| `GET` | `/spots/recommendations` | Recommandations selon les goûts / humeurs | Optionnel | `?moods=travail,calme` | `200 Spot[]` |
| `GET` | `/spots/:id` | Détails complets d'un spot (avis, photos, etc.) | Non | - | `200 Spot` |
| `POST` | `/spots` | Création d'un spot (débloque le badge *explorateur*) | **JWT** | JSON ou `multipart/form-data` avec champ `photo`, `visibility?` (`PUBLIC` par défaut, `FRIENDS`, `PRIVATE`) | `201 Spot` (`400` si titre/catégorie manquants ou visibilité invalide) |
| `PUT` | `/spots/:id` | Modification d'un spot | **JWT (créateur)** | `{ title?, description?, category?, moods?, budget?... }` | `200 Spot` |
| `DELETE` | `/spots/:id` | Suppression d'un spot | **JWT (créateur)** | - | `204 No Content` |

---

###  Interactions Sociales : Favoris, Avis & Photos

| Méthode | Route | Description | Auth | Paramètres / Requête | Réponse |
|---|---|---|---|---|---|
| `POST` | `/spots/:id/favorite` | Ajouter / Retirer des favoris (toggle) | **JWT** | - | `200 { favorited: boolean, favoritesCount: number }` |
| `POST` | `/spots/:id/reviews` | Laisser une note (1 à 5) et un avis | **JWT** | `{ rating, comment?, moodExperienced? }` | `201 Spot` |
| `DELETE` | `/spots/:id/reviews/:reviewId`| Supprimer son avis | **JWT (auteur)** | - | `200 Spot` |
| `POST` | `/spots/:id/photos` | Uploader une photo supplémentaire (*badge photographe*) | **JWT** | `multipart/form-data` avec champ `photo` | `201 Spot` |
| `GET` | `/uploads/:filename` | Accès au fichier image physique | Non | - | Fichier binaire image |

---

###  Listes Personnalisées

| Méthode | Route | Description | Auth | Requête | Réponse |
|---|---|---|---|---|---|
| `GET` | `/lists` | Récupérer mes listes | **JWT** | - | `200 CustomList[]` |
| `POST` | `/lists` | Créer une liste personnalisée | **JWT** | `{ name, description?, isPublic? }` | `201 CustomList` |
| `GET` | `/lists/:id` | Consulter une liste et ses spots | Non | - | `200 CustomList` |
| `POST` | `/lists/:id/spots/:spotId` | Ajouter un spot à la liste | **JWT (créateur)** | - | `200 CustomList` |
| `DELETE` | `/lists/:id/spots/:spotId` | Retirer un spot de la liste | **JWT (créateur)** | - | `200 CustomList` |
| `DELETE` | `/lists/:id` | Supprimer la liste | **JWT (créateur)** | - | `204 No Content` |

---

### Réseau Social, Amis, Partage & Fil d'activité

| Méthode | Route | Description | Auth | Requête (Body / Query) | Réponse |
|---|---|---|---|---|---|
| `GET` | `/users/search` | Recherche d'utilisateurs avec statut relationnel | **JWT** | `?q=alex` | `200 UserSearchResult[]` |
| `GET` | `/friends` | Liste des amis, invitations reçues et envoyées | **JWT** | - | `200 { friends, incomingRequests, outgoingRequests }` |
| `POST` | `/friends/request/:userId` | Envoyer une demande d'ami | **JWT** | - | `201 { message, targetUserId }` |
| `PATCH` | `/friends/respond/:requestId` | Accepter ou refuser une invitation | **JWT** | `{ action: "ACCEPT" \| "REJECT" }` | `200 { message, status }` |
| `DELETE` | `/friends/:friendId` | Retirer un ami et purger ses accès partagés | **JWT** | - | `200 { message, revokedSpotsCount }` |
| `PATCH` | `/spots/:id/share` | Modifier visibilité (`PUBLIC`/`FRIENDS`/`PRIVATE`) ou `sharedWith` | **JWT (créateur)** | `{ visibility?, sharedWith?, addUserId?, removeUserId? }` | `200 Spot` |
| `GET` | `/feed` | Fil d'activité chronologique des amis | **JWT** | - | `200 FeedItem[]` |
| `PUT` | `/lists/:id` | Modifier une liste et ses collaborateurs | **JWT (créateur)** | `{ name?, description?, isPublic?, collaborators? }` | `200 CustomList` |
| `PUT` | `/lists/:id/reorder` | Réordonner les spots d'une liste (Drag & Drop) | **JWT (créateur/collab.)** | `{ spotIds: string[] }` | `200 CustomList` |

---

## 2. Modèles de Données

### `User`
```json
{
  "id": "6acf791885a67176f36cbf7b",
  "name": "Alex Vibe",
  "email": "demo@example.com",
  "avatar": "https://example.com/avatar.jpg",
  "bio": "Amateur de cafés calmes pour coder et de rooftop au coucher de soleil.",
  "tastes": ["travail", "calme", "photo"],
  "favorites": ["6acf8150e98f5f3142127f47"],
  "badges": ["pionnier", "explorateur", "foodie"],
  "createdAt": "2026-10-14T12:44:08.337Z"
}
```

### `Spot`
```json
{
  "id": "6acf8150e98f5f3142127f47",
  "title": "Café Koohi & Cowork",
  "description": "Grand café lumineux, wifi ultra rapide, prises partout et ambiance studieuse.",
  "category": "cafe",
  "moods": ["travail", "calme"],
  "budget": 1,
  "address": "12 Rue de France",
  "city": "Nice",
  "postalCode": "06000",
  "location": {
    "type": "Point",
    "coordinates": [7.2612, 43.6974]
  },
  "longitude": 7.2612,
  "latitude": 43.6974,
  "coverPhoto": "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800",
  "photos": [],
  "createdBy": "6acf791885a67176f36cbf7b",
  "ratingAverage": 4.8,
  "ratingCount": 12,
  "favoritesCount": 24,
  "affluence": "moderee",
  "tags": ["wifi", "prises", "specialty coffee"],
  "reviews": [
    {
      "id": "6acf82a1e98f5f3142127f48",
      "userId": "6acf791885a67176f36cbf7b",
      "userName": "Demo",
      "rating": 5,
      "comment": "Super ambiance pour travailler au calme !",
      "moodExperienced": "travail",
      "createdAt": "2026-10-14T13:20:00.000Z"
    }
  ],
  "createdAt": "2026-10-14T13:00:00.000Z",
  "updatedAt": "2026-10-14T13:20:00.000Z"
}
```

### `Page<Spot>` (Pagination)
```json
{
  "items": [ /* Tableau de Spot */ ],
  "page": 1,
  "limit": 10,
  "total": 42,
  "pages": 5
}
```

---

## 3. Paramètres de filtrage pour `GET /api/spots`

| Paramètre | Type | Exemple | Description |
|---|---|---|---|
| `page` | Entier | `1` | Numéro de la page (défaut : 1) |
| `limit` | Entier | `10` | Nombre d'éléments par page (max : 50) |
| `mood` | Chaîne | `travail` | Filtre par humeur (`travail`, `calme`, `festif`, `gourmand`, `sportif`, `photo`, `romantique`, `nature`) |
| `category` | Chaîne | `cafe` | Filtre par catégorie (`restaurant`, `cafe`, `bar`, `parc`, `skatepark`, `salle_concert`, `bibliotheque`, `coworking`, `lieu_culturel`, `terrain_sport`) |
| `budget` | Entier | `1`, `2` ou `3` | Échelle de prix : 1 (€), 2 (€€), 3 (€€€) |
| `city` | Chaîne | `Nice` | Filtrer par nom de ville |
| `search` | Chaîne | `terrasse` | Recherche textuelle dans le titre, la description, la ville ou les tags |
| `lat`, `lng` | Flottants | `43.70`, `7.26` | Coordonnées GPS pour le calcul de proximité géographique |
| `maxDistance`| Entier | `5000` | Distance max en mètres (défaut : 10000 m / 10 km) via index géospatial 2dsphere |
| `sort` | Chaîne | `popular`, `recent`, `rating` | Ordre de tri |

---

## 4. Codes d'erreurs HTTP standard

* `400 Bad Request` : Paramètres invalides, mot de passe trop court ou champ obligatoire manquant.
* `401 Unauthorized` : Token JWT absent, invalide ou expiré.
* `403 Forbidden` : Action non autorisée (ex: modifier un spot créé par un autre utilisateur).
* `404 Not Found` : Ressource introuvable (utilisateur, spot, liste ou avis inexistant).
* `409 Conflict` : Email déjà utilisé lors de l'inscription.
* `500 Internal Server Error` : Erreur interne non gérée.
