Différence entre un Signal Angular et localStorage :

- localStorage : C'est une API native du navigateur (Web Storage) qui permet de stocker des données sous forme de paires clé/valeur de manière persistante (même après la fermeture de l'onglet ou du navigateur). Il est synchrone et ne déclenche pas automatiquement de réactivité dans le framework par lui-même.

- Signal : un Signal est un mécanisme de gestion d'état réactif en mémoire vive. Il encapsule une valeur et notifie automatiquement le système (plus précisemment les composants) dès que cette valeur change pour mettre à jour l'affichage en temps réel.

En clair: localStorage sert à persister l'information sur le disque du navigateur (comme le token JWT), tandis que le Signal sert à propager l'état de manière réactive dans l'application front-end.

Utilisation dans le fichier "auth.service.ts" de notre projet:

Dans ce service d'authentification Angular, les deux sont combinés pour gérer la session utilisateur :

Dans ce service, les Signals et le localStorage fonctionnent en binôme pour assurer la persistance et la réactivité de la session. Au démarrage, le localStorage sert de mémoire persistante pour récupérer un éventuel token déjà enregistré (comme le fait cette ligne de code: localStorage.getItem('gpc_token')), qui vient initialiser notre Signal token. Ensuite, lors d'une connexion ou d'une inscription, la méthode storeAuthentication joue un rôle essentiel : elle stocke le nouveau token dans le localStorage pour qu'il survive au rechargement de la page, tout en mettant à jour les Signals token et currentUser pour propager l'information dans toute l'application en temps réel. Enfin, à la déconnexion, le service fait l'inverse en nettoyant proprement le localStorage et en remettant les Signals à null pour réinitialiser l'état de l'utilisateur.