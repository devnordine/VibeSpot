La modification du profil commence dans profile-page.html, qui déclenche save() dans profile-page.ts. Le composant appelle ensuite AuthService.update() dans auth.service.ts. Ce service envoie une requête PUT /api/users/me. L’interceptor ajoute automatiquement le JWT. Côté backend, la route correspondante est définie dans backend/src/app.js. Le middleware auth identifie l’utilisateur, puis User.findByIdAndUpdate() modifie son nom dans MongoDB. Le modèle et ses validations sont définis dans backend/src/models/User.js. Enfin, le nouveau profil est placé dans le Signal currentUser.

Authentification

Méthode	Route	Appel frontend	Utilisation
POST	/api/auth/register	auth.service.ts	Création d’un compte
POST	/api/auth/login	auth.service.ts	Connexion de l’utilisateur
GET	/api/users/me	auth.service.ts	Chargement du profil
PUT	/api/users/me	auth.service.ts	Modification du nom du profil

Les appels de connexion et d’inscription sont déclenchés respectivement par :

login-page.ts
register-page.ts
Gestion des pistes audio
Méthode	Route	Appel frontend	Utilisation
GET	/api/tracks	track.service.ts	Liste paginée des pistes
POST	/api/tracks	track.service.ts	Upload d’un fichier audio
GET	/api/tracks/:id/audio	track.service.ts	Lecture d’une piste audio