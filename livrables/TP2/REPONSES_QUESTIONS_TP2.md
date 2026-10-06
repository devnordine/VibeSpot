# Réponses aux questions techniques - TP2 (Guitar Practice Cloud)

## 1. Mémoire, buffering et streaming audio

### Le backend envoie-t-il le fichier entier en mémoire ou peut-il l’envoyer progressivement depuis le disque ?
Le backend Express utilise les streams Node.js (via `fs.createReadStream` combiné à `pipe(res)`). Il n'a donc pas besoin de charger l'intégralité du fichier audio (qui peut peser jusqu'à 25 Mo) dans sa mémoire vive (RAM). Il lit le fichier par blocs de données (*chunks*) depuis le disque et les pousse progressivement sur le flux de réponse HTTP vers le client.

### Avec HttpClient et `responseType: "blob"`, à quel moment le composant reçoit-il généralement le fichier ?
Contrairement à un flux direct lu au fil de l'eau, `HttpClient` d'Angular attend que **la totalité** du corps de la réponse HTTP soit téléchargée par le navigateur avant d'émettre l'objet `Blob` via l'Observable RxJS. Le callback `next(blob)` du composant n'est donc exécuté qu'une fois le fichier 100 % présent dans la mémoire RAM du client.

### Si la bibliothèque contient 100 morceaux, les 100 fichiers audio sont-ils chargés en mémoire dès l'affichage de la liste ? Justifier la réponse à partir du code.
**Non.** À l'affichage de la liste, seul l'appel paginé `GET /api/tracks?page=...&limit=...` est exécuté. Cette requête ne retourne qu'un tableau d'objets JSON contenant les métadonnées légères des pistes (`id`, `title`, `size`, `originalName`, etc.). Le flux binaire audio n'est demandé via `TrackService.audio(id)` **qu'au moment où l'utilisateur clique explicitement sur le bouton de lecture** (`play(track)`).

### Quelle différence y aurait-il avec 100 éléments `<audio>` utilisant directement une URL HTTP ?
Avec 100 balises `<audio src="...">` présentes dans le DOM, le comportement dépend de l'attribut `preload` du navigateur :
- Même sans lecture active, le navigateur peut initier des requêtes HTTP préemptives pour précharger les métadonnées (durée, en-têtes) ou les premières secondes de chaque fichier (*buffering initial*).
- Cela engendrerait des dizaines de connexions HTTP simultanées inutiles, saturant la bande passante et la mémoire du navigateur, contrairement à notre architecture à la demande.

### Pourquoi l'URL créée par `URL.createObjectURL` doit-elle être révoquée ?
`URL.createObjectURL(blob)` enregistre une URL interne (`blob:http:...`) dans la table de correspondance mémoire du moteur de rendu du navigateur. Tant que cette URL existe, le Garbage Collector s'interdit de libérer la mémoire allouée au `Blob` binaire, même si aucune balise ne l'utilise plus. L'appel à `URL.revokeObjectURL(url)` est indispensable pour détacher le pointeur et autoriser la libération immédiate de la mémoire vive (RAM).

---

## 2. Authentification et lecture audio (`Blob` vs balise `<audio>`)

### Pourquoi un simple `<audio src="/api/tracks/:id/audio">` échoue-t-il ?
La balise HTML `<audio>` déclenche une requête HTTP native directement par le navigateur. Elle ne passe pas par l'intercepteur Angular (`authInterceptor`) et ne peut donc pas injecter l'en-tête HTTP `Authorization: Bearer <token>`. Le serveur Express détecte l'absence de JWT et renvoie systématiquement une réponse `401 Unauthorized`.

### Fonctionnement du flux sécurisé :
1. `HttpClient` exécute la requête `GET /api/tracks/:id/audio`.
2. L'intercepteur injecte le JWT dans les en-têtes.
3. Le binaire est reçu sous forme de `Blob` sécurisé en mémoire.
4. `URL.createObjectURL(blob)` fournit une URL utilisable par la balise `<audio>` sans exposer le token dans l'URL.