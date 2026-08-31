# Mission Aquapolis

Livre du jeu numérique (PWA) pour le jeu de piste "Mission Aquapolis" — Strasbourg, 17 septembre 2026.

- `index.html` + `js/app.js` — application des 5 chefs de brigade (choix d'équipe, épreuves, chronomètre, carte, écran final).
- `admin.html` + `js/admin.js` — édition du contenu du jeu (protégée par mot de passe Firebase).
- `dashboard.html` + `js/dashboard.js` — suivi en direct des 5 équipes pour le coordinateur.
- `content.json` — contenu de test embarqué, utilisé tant que Firebase n'est pas configuré (ou en secours hors-ligne).
- `js/sync.js` — toute la logique Firebase, chargée en différé et jamais bloquante : le jeu fonctionne même sans Firebase.
- `firebase/firestore.rules` — règles de sécurité à coller dans la console Firebase.

Voir le guide de déploiement fourni séparément pour la mise en ligne et la modification du contenu sans coder.
