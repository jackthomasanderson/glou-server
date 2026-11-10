# Déployer la stack Glou

**TL;DR** : Trois commandes. Docker télécharge les images pré-construites, sans compilation.

**Prérequis** :
- Docker installé et en cours d'exécution (inclut Docker Compose v2).

**Action** :

1. Copier le fichier d'environnement :
   ```bash
   cp .env.example .env
   ```

2. Ouvrir `.env` et définir `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY` et `DB_PASSWORD` avec de vraies valeurs (`.env.example` ne contient que des valeurs d'exemple non sécurisées) :
   ```bash
   openssl rand -base64 48   # JWT_SECRET
   openssl rand -hex 32      # CONFIG_ENCRYPTION_KEY
   openssl rand -base64 24   # DB_PASSWORD
   ```
   Collez chaque résultat dans la variable correspondante de `.env`.

   > [!CAUTION]
   > Ne sautez pas cette étape. `docker compose up` refuse de démarrer Postgres si `DB_PASSWORD` est vide ou absent (pas de repli non sécurisé), et l'API refuse d'accepter la moindre requête en production si `JWT_SECRET` ou `CONFIG_ENCRYPTION_KEY` est absent, vide, vaut encore exactement son placeholder de `.env.example`, ou (pour `CONFIG_ENCRYPTION_KEY`) n'est pas composé de 64 caractères hexadécimaux. Elle logue un message `🛑 [startup] FATAL` et s'arrête (`process.exit(1)`). Ce contrôle ne s'applique que si `NODE_ENV` n'est pas `development` : le développement local continue de fonctionner avec un simple avertissement en console.

3. Créer le dossier des sauvegardes (Linux), puis démarrer la stack :
   ```bash
   mkdir -p backups && sudo chown 1001:1001 backups
   docker compose up -d
   ```
   L'API tourne sous l'uid non privilégié 1001 et écrit ses sauvegardes nocturnes dans `./backups`. Si le dossier n'existe pas, Docker le crée en root et chaque sauvegarde échoue avec « Permission denied » (l'API le signale au démarrage et **Administration → Configuration Système → Données** affiche un avertissement). Docker Desktop sous macOS/Windows n'a pas besoin de cette étape.
   Docker télécharge `glou-server-api` et `glou-server-web` depuis GHCR automatiquement. Cela démarre uniquement la base, l'API et le web (~1,5 Go de RAM). Pour le scan d'étiquette optionnel (~9 Go de disque et ~3 Go de RAM en plus), utilisez `docker compose --profile scan up -d`.

4. Ouvrir [http://localhost:3000](http://localhost:3000), cliquer sur **S'inscrire** (sous le formulaire de connexion), puis sur **Créer mon compte**.
   Le premier compte créé reçoit automatiquement les droits administrateur. **L'inscription est ensuite fermée** : les autres personnes ne peuvent s'inscrire qu'une fois que l'admin a activé **Autoriser l'inscription de nouveaux comptes** dans **Administration → Configuration Système → Accès**.

5. *(Facultatif)* Configurer l'instance depuis **Administration → Configuration Système**.
   Rien ici n'est requis pour utiliser l'application : chaque section reste inactive tant qu'elle n'est pas configurée. À paramétrer plus tard, si besoin :

   | Onglet | Rôle |
   | :--- | :--- |
   | **Notifications** | Une carte par canal, chacune avec son interrupteur, ses réglages et son test : **Dans l'application**, **E-mail** (serveur SMTP pour la réinitialisation du mot de passe et les notifications par e-mail) et **Gotify** (URL et jeton d'application d'un serveur [Gotify](https://gotify.net/) : toutes les notifications Gotify des membres y partent, chacune titrée du nom du membre ; les membres choisissent seulement dans leur profil de les recevoir ou non). Un canal coupé ici reste indisponible dans les préférences de chaque membre. |
   | **Accès** | **Qui peut rejoindre l'instance** : l'inscription de nouveaux comptes. **URL publique** : l'adresse de référence de l'instance et le mode d'accès (direct ou via reverse proxy), avec une vérification de ce réglage. |
   | **Données** | **Sauvegardes** : sauvegarde quotidienne de la base (`pg_dump`) avec rétention et heure d'exécution, une sauvegarde manuelle, et l'historique avec téléchargement et restauration. **Rétention et nettoyage** : durée de conservation des logs d'audit, sessions/appareils et partages invités expirés. **Supprimer toutes les données** : la purge de toutes les bouteilles, caves et journaux. |
   | **Système** | La version en service (à copier dans un rapport de bug), l'état du scan d'étiquette (service Ollama intégré, `--profile scan`) et l'historique des modifications de cette configuration. |

   > [!NOTE]
   > Ce panneau est réservé aux comptes administrateur (`/admin`, accès refusé sinon).

**Portainer, Synology Container Manager ou une autre interface** :

La pile n'a pas de dossier à elle sur l'hôte : le `./backups` relatif de `docker-compose.yml` aboutit dans un dossier que Docker crée en root, hors de votre portée. L'API ne peut pas y écrire ses sauvegardes, et **une mise à jour qui apporte des migrations s'arrête** : l'API ne démarre pas, et l'interface indique seulement que le conteneur `api` est « unhealthy ». Avant le premier démarrage :

1. Dans la pile, remplacez `- ./backups:/app/backups` par un chemin absolu de l'hôte, par ex. `- /opt/glou/backups:/app/backups`.
2. Sur l'hôte (SSH) : `sudo mkdir -p /opt/glou/backups && sudo chown 1001:1001 /opt/glou/backups`.
3. Renseignez `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY` et `DB_PASSWORD` dans les variables d'environnement de la pile (étape 2 ci-dessus), puis déployez.

Quand l'API ne démarre pas, son journal en donne la raison : dans Portainer, **Containers → `<pile>-api-1` → Logs** ; sur l'hôte, `docker logs <pile>-api-1`.

**Mise à jour vers une nouvelle version** :

Sauvegardez d'abord (**Administration → Configuration Système → Données → Sauvegarder maintenant**) : les migrations de la base ne peuvent pas être annulées. Sous Linux, vérifiez que `backups` appartient à l'uid 1001 (`sudo chown 1001:1001 backups`), sinon la sauvegarde échoue. Puis :
```bash
docker compose pull && docker compose up -d
```
Pour revenir en arrière, voir [Mettre à jour & revenir en arrière](./31-Mises-A-Jour-Et-Retour-Arriere.md).

**Le "Pare-feu" (Troubleshooting)** :

| Erreur | Résolution |
| :--- | :--- |
| `port is already allocated` | Un autre processus utilise le port 3000 (web). Arrêtez le processus en conflit, ou modifiez le mapping de port dans `docker-compose.yml`. (Postgres n'est pas publié vers l'hôte, voir plus bas, donc le port 5432 ne peut pas provoquer ce conflit.) |
| `docker compose: command not found` | Votre installation Docker utilise l'ancien CLI. Remplacez `docker compose` par `docker-compose` (avec tiret). |
| L'API retourne 401 sur toutes les requêtes | `JWT_SECRET` est vide ou contient la valeur d'exemple. Définissez une vraie valeur dans `.env` et redémarrez : `docker compose up -d`. |
| `docker compose up` échoue avec `DB_PASSWORD is not set` | `DB_PASSWORD` est vide ou absent de `.env`. Définissez un vrai mot de passe (`openssl rand -base64 24`) et relancez. Il n'y a volontairement pas de repli non sécurisé. |
| L'API logue `🛑 [startup] FATAL ... still has its .env.example placeholder value`, `... is not set (or empty)` ou `... is malformed`, puis s'arrête | `JWT_SECRET` ou `CONFIG_ENCRYPTION_KEY` est absent ou vide, égal au placeholder de `.env.example`, ou (`CONFIG_ENCRYPTION_KEY`) n'est pas composé de 64 caractères hexadécimaux. Générez de vraies valeurs (étape 2 ci-dessus) et redémarrez. Sur une interface NAS (Synology Container Manager, Portainer...), vérifiez que les variables sont bien transmises au conteneur `api` : une variable non définie lui arrive sous forme de chaîne vide. |
| La connexion réussit mais vous êtes déconnecté aussitôt (`http://` simple sur réseau local ou NAS) | Les cookies de session ne sont marqués `Secure` que si `APP_URL` commence par `https://`. Renseignez `APP_URL` dans `.env` avec l'adresse réellement utilisée (ex. `http://192.168.1.20:3000`) puis redémarrez. Si un proxy termine le TLS alors que `APP_URL` indique `http`, définissez `COOKIE_SECURE=true`. En HTTP simple, le mode hors ligne, l'installation de l'application et le presse-papiers sont limités par le navigateur ; utilisez HTTPS pour lever ces limites. |
| `permission denied` sur `/app/backups` ou `/app/uploads`, ou l'API redémarre en boucle, après avoir remplacé un volume nommé par un dossier de l'hôte | Le conteneur API tourne toujours sous l'utilisateur `1001:1001` (`PUID`/`PGID` de la convention linuxserver.io ne sont **pas** pris en charge). Donnez ce dossier à cet utilisateur : `sudo chown -R 1001:1001 <dossier>`. Sur Synology, faites-le en SSH, ou réglez les permissions du dossier pour un utilisateur d'UID 1001. |
| `image not found` / erreur de pull | Les packages GHCR sont peut-être privés. Authentifiez-vous d'abord : `docker login ghcr.io -u VOTRE_USERNAME_GITHUB`. |
| Portainer (ou une autre interface) affiche `dependency failed to start: container …-api-1 is unhealthy` | L'API n'a pas démarré. Lisez son journal (voir **Portainer, Synology Container Manager ou une autre interface** ci-dessus). Après une mise à jour, la cause la plus fréquente est `[backup] Migrations are pending, but /app/backups is not writable` : utilisez un chemin `backups` absolu appartenant à l'uid 1001, comme décrit ci-dessus, puis redéployez. |
| Erreur de migration Prisma au démarrage | Le conteneur `db` n'était pas prêt. Exécutez `docker compose restart api` pour relancer la migration. |
| Création de compte ou connexion qui échoue avec « erreur inattendue » (ou « adresse non autorisée ») quand vous ouvrez Glou par son IP, ex. `http://192.168.1.20:3000`, sans rien dans les logs de `api` ni de `web` | L'API refuse les requêtes qui modifient des données depuis une adresse inconnue. Renseignez `APP_URL` dans `.env` avec l'adresse exacte saisie dans le navigateur (ex. `http://192.168.1.20:3000`), puis recréez le conteneur `api`. Plusieurs adresses : listez-les dans `CSRF_TRUSTED_ORIGINS`, séparées par des virgules. Le log de `api` affiche alors une ligne `[csrf] Rejected ...` quand cela se produit. |
| « L'inscription de nouveaux comptes est actuellement fermée sur cette instance », ou pas de lien **S'inscrire** sur la page de connexion | Attendu dès que le premier compte existe. Un admin ouvre l'inscription dans **Administration → Configuration Système → Accès → Autoriser l'inscription de nouveaux comptes** et peut la refermer une fois la personne inscrite. |
| Besoin d'un accès `psql` ponctuel à la base | Postgres n'est volontairement pas exposé au LAN/hôte (`expose`, pas `ports`, dans `docker-compose.yml`). Utilisez `docker compose exec db psql -U glou -d glou_db` plutôt que d'ouvrir le port. |
