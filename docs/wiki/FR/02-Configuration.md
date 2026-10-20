# Configuration de l'environnement

**TL;DR** : Tout se configure dans le fichier `.env`, à côté de `docker-compose.yml`. Trois valeurs sont obligatoires et n'ont aucune valeur par défaut sûre : `DB_PASSWORD`, `JWT_SECRET` et `CONFIG_ENCRYPTION_KEY`.

**Prérequis** :
- Le fichier `.env` créé depuis `.env.example` (`cp .env.example .env`).

**Action** :
1. Ouvrez le fichier `.env` à la racine du projet.
2. Définissez les trois secrets obligatoires (commandes de génération dans [Installation](./01-Installation.md)) : `DB_PASSWORD`, `JWT_SECRET` (`openssl rand -base64 48`) et `CONFIG_ENCRYPTION_KEY` (`openssl rand -hex 32`, exactement 64 caractères hexadécimaux).
3. Si vous ouvrez Glou autrement que par `http://localhost:3000` (IP de NAS, nom de domaine), réglez `APP_URL` sur cette adresse exacte et `CORS_ORIGIN` sur la même valeur.
4. Appliquez les changements : `docker compose up -d` (les conteneurs dont les variables ont changé sont recréés).

## Variables

| Variable | Défaut | Rôle |
| :--- | :--- | :--- |
| `DB_PASSWORD` | aucun, **obligatoire** | Mot de passe PostgreSQL. `docker compose up` refuse de démarrer sans lui. |
| `DB_USER` / `DB_NAME` | `glou` / `glou_db` | Rôle et base PostgreSQL. Lus uniquement à la première création du volume `db`. |
| `JWT_SECRET` | aucun, **obligatoire** | Signe les jetons de session. L'API quitte au démarrage s'il est vide ou égal au placeholder de `.env.example`. |
| `CONFIG_ENCRYPTION_KEY` | aucun, **obligatoire** | 64 caractères hexadécimaux. Chiffre en base le mot de passe SMTP, le jeton Gotify et les clés d'intégration. Même vérification au démarrage que `JWT_SECRET`. |
| `NODE_ENV` | `production` | En `development`, les vérifications de secrets se limitent à un avertissement. |
| `APP_URL` | `http://localhost:3000` | Adresse publique de l'app web. `https://` marque les cookies de session `Secure` et active HSTS ; `http://` ne fait ni l'un ni l'autre. C'est aussi la valeur de repli des liens générés par l'app (voir [Réseau & URL publique](./16-Configuration-Reseau-URL-Publique.md)). |
| `CORS_ORIGIN` | `http://localhost:3000` | Origine(s) acceptée(s) par l'API. Généralement identique à `APP_URL`. |
| `CSRF_TRUSTED_ORIGINS` | vide | Adresses supplémentaires du navigateur autorisées à envoyer des requêtes, séparées par des virgules (par exemple un second nom d'hôte). |
| `COOKIE_SECURE` | vide | `true`/`false` force le drapeau `Secure` des cookies, par exemple quand le TLS est terminé par un proxy alors que `APP_URL` est en `http://`. |
| `FORCE_HSTS` | vide | `true`/`false` force l'en-tête `Strict-Transport-Security` indépendamment de `APP_URL`. |
| `NEXT_PUBLIC_API_URL` | `http://api:3001` | Adresse de l'API vue depuis le conteneur web, dans le réseau compose. À laisser telle quelle sous Docker. |
| `OLLAMA_URL` | `http://ollama:11434` | Modèle de vision utilisé par le [scan d'étiquette](./26-Scan-Etiquette.md) (uniquement avec `--profile scan`). |
| `OLLAMA_MODEL` | `moondream` | Nom du modèle utilisé pour le scan. |
| `OLLAMA_TIMEOUT_MS` | `600000` | Durée maximale d'attente du modèle par scan, en millisecondes. |

> [!NOTE]
> `PUID`/`PGID` ne sont pas pris en charge : le conteneur API tourne toujours sous l'utilisateur `1001:1001`.

Les réglages qui vivent dans l'application plutôt que dans `.env` (SMTP, notifications, rétention, sauvegardes, URL publique, inscription) se trouvent dans **Administration → Configuration Système**, voir [Installation](./01-Installation.md).

**Le "Pare-feu" (Troubleshooting)** :

| Erreur | Résolution |
| :--- | :--- |
| `DB_PASSWORD is not set` | Définissez `DB_PASSWORD` dans `.env`. Il n'y a aucun mot de passe de repli. |
| L'API affiche `🛑 [startup] FATAL` et quitte | `JWT_SECRET` ou `CONFIG_ENCRYPTION_KEY` est absent, vide, égal au placeholder ou (`CONFIG_ENCRYPTION_KEY`) n'a pas 64 caractères hexadécimaux. |
| `password authentication failed for user` | `DB_USER`, `DB_PASSWORD` et `DB_NAME` doivent correspondre à ceux de la première création du volume `db`. Changer `DB_PASSWORD` ensuite exige de le changer aussi dans Postgres, voir [Changer les secrets](./29-Rotation-Des-Secrets.md#changer-db_password) ; sinon supprimez le volume `db_data`, ce qui efface toutes les données. |
| Déconnexion immédiate, ou connexion impossible, en ouvrant Glou par IP | Réglez `APP_URL` sur l'adresse exacte saisie dans le navigateur, puis recréez les conteneurs `api` et `web`. |
