# Déployer la Stack Glou

**TL;DR** : Trois commandes. Docker télécharge les images pré-construites — aucune compilation requise.

**Prérequis** :
- Docker installé et en cours d'exécution (inclut Docker Compose v2).

**Action** :

1. Copier le fichier d'environnement :
   ```bash
   cp .env.example .env
   ```

2. Ouvrir `.env` et définir `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY` et `DB_PASSWORD` avec de vraies valeurs — `.env.example` ne contient que des valeurs d'exemple non sécurisées :
   ```bash
   openssl rand -base64 32   # JWT_SECRET
   openssl rand -hex 32      # CONFIG_ENCRYPTION_KEY
   openssl rand -base64 24   # DB_PASSWORD
   ```
   Collez chaque résultat dans la variable correspondante de `.env`.

   > [!CAUTION]
   > Ne sautez pas cette étape. `docker compose up` refuse désormais de démarrer Postgres si `DB_PASSWORD` est vide ou absent (plus de repli non sécurisé), et l'API refuse d'accepter la moindre requête en production si `JWT_SECRET` ou `CONFIG_ENCRYPTION_KEY` valent encore exactement leur valeur placeholder de `.env.example` — elle logue un message `🛑 [startup] FATAL` et s'arrête (`process.exit(1)`). Ce contrôle ne s'applique que si `NODE_ENV` n'est pas `development` — le développement local continue de fonctionner avec un simple avertissement en console, pour ne pas forcer chaque contributeur à générer des secrets juste pour bidouiller l'app.

3. Démarrer la stack :
   ```bash
   docker compose up -d
   ```
   Docker télécharge `glou-server-api` et `glou-server-web` depuis GHCR automatiquement.

4. Ouvrir [http://localhost:3000](http://localhost:3000) et cliquer sur **S'inscrire**.
   Le premier compte créé reçoit automatiquement les droits administrateur.

**Mise à jour vers une nouvelle version** :
```bash
docker compose pull && docker compose up -d
```

**Le "Pare-feu" (Troubleshooting)** :

| Erreur | Résolution |
| :--- | :--- |
| `port is already allocated` | Un autre processus utilise le port 3000 (web) ou 3001 (api). Arrêtez le processus en conflit, ou modifiez le mapping de port dans `docker-compose.yml`. (Postgres n'est plus publié vers l'hôte — voir plus bas — donc le port 5432 ne peut plus provoquer ce conflit.) |
| `docker compose: command not found` | Votre installation Docker utilise l'ancien CLI. Remplacez `docker compose` par `docker-compose` (avec tiret). |
| L'API retourne 401 sur toutes les requêtes | `JWT_SECRET` est vide ou contient la valeur d'exemple. Définissez une vraie valeur dans `.env` et redémarrez : `docker compose up -d`. |
| `docker compose up` échoue avec `DB_PASSWORD is not set` | `DB_PASSWORD` est vide ou absent de `.env`. Définissez un vrai mot de passe (`openssl rand -base64 24`) et relancez — il n'y a volontairement plus de repli non sécurisé. |
| L'API logue `🛑 [startup] FATAL ... still has its .env.example placeholder value` et s'arrête | `JWT_SECRET` ou `CONFIG_ENCRYPTION_KEY` dans `.env` correspondent encore exactement au placeholder de `.env.example`. Générez de vraies valeurs (étape 2 ci-dessus) et redémarrez. |
| `image not found` / erreur de pull | Les packages GHCR sont peut-être privés. Authentifiez-vous d'abord : `docker login ghcr.io -u VOTRE_USERNAME_GITHUB`. |
| Erreur de migration Prisma au démarrage | Le conteneur `db` n'était pas prêt. Exécutez `docker compose restart api` pour relancer la migration. |
| Besoin d'un accès `psql` ponctuel à la base | Postgres n'est volontairement pas exposé au LAN/hôte (`expose`, pas `ports`, dans `docker-compose.yml`). Utilisez `docker compose exec db psql -U glou -d glou_db` plutôt que d'ouvrir le port. |
