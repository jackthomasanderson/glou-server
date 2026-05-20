# Déployer la Stack Glou

**TL;DR** : Trois commandes. Docker télécharge les images pré-construites — aucune compilation requise.

**Prérequis** :
- Docker installé et en cours d'exécution (inclut Docker Compose v2).

**Action** :

1. Copier le fichier d'environnement :
   ```bash
   cp .env.example .env
   ```

2. Ouvrir `.env` et définir `JWT_SECRET` avec une valeur aléatoire robuste :
   ```bash
   openssl rand -hex 32
   ```
   Collez le résultat comme valeur de `JWT_SECRET`.

   > [!CAUTION]
   > Ne sautez pas cette étape. La valeur d'exemple dans `.env.example` n'est pas sécurisée.

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
| `port is already allocated` | Un autre processus utilise le port 3000 (web), 3001 (api) ou 5432 (db). Arrêtez le processus en conflit, ou modifiez le mapping de port dans `docker-compose.yml`. |
| `docker compose: command not found` | Votre installation Docker utilise l'ancien CLI. Remplacez `docker compose` par `docker-compose` (avec tiret). |
| L'API retourne 401 sur toutes les requêtes | `JWT_SECRET` est vide ou contient la valeur d'exemple. Définissez une vraie valeur dans `.env` et redémarrez : `docker compose up -d`. |
| `image not found` / erreur de pull | Les packages GHCR sont peut-être privés. Authentifiez-vous d'abord : `docker login ghcr.io -u VOTRE_USERNAME_GITHUB`. |
| Erreur de migration Prisma au démarrage | Le conteneur `db` n'était pas prêt. Exécutez `docker compose restart api` pour relancer la migration. |
