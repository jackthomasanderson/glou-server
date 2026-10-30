# Mettre à jour Glou et revenir en arrière en cas de problème

## En bref
Glou applique ses migrations de base automatiquement au démarrage de l'API, et **les migrations ne vont que vers l'avant** : il n'existe pas de migration « inverse ». Revenir en arrière signifie restaurer la sauvegarde faite avant la mise à jour, avec l'image précédente. **Glou prend cette sauvegarde lui-même** quand une mise à jour apporte des migrations de base : un fichier `glou-backup-before-migration-<date>.sql.gz` dans le dossier `./backups`, à côté de `docker-compose.yml`. Notez l'image que vous utilisez avant de mettre à jour.

## Prérequis
* Accès shell à la machine.
* Sous Linux, le dossier `backups` à côté de `docker-compose.yml` doit appartenir à l'uid 1001 : `mkdir -p backups && sudo chown 1001:1001 backups`. Sinon la sauvegarde automatique échoue, et l'API ne démarre pas (rien n'est migré).
* La sauvegarde de la base suffit à annuler les changements de schéma ; les photos ne sont pas touchées par les migrations.

## La sauvegarde prise avant de migrer
* Quand l'API démarre et trouve des migrations qu'elle n'a pas encore appliquées, sur une instance qui a déjà au moins un compte, elle sauvegarde d'abord toute la base, avec le même `pg_dump` que la sauvegarde nocturne. Une nouvelle installation, ou une mise à jour sans migration, ne prend pas cette sauvegarde.
* Le fichier est `./backups/glou-backup-before-migration-<date>.sql.gz` (`/app/backups` dans le conteneur). Une fois l'API démarrée, il apparaît aussi dans Admin → Configuration système → Sauvegardes, d'où vous pouvez le télécharger.
* Il est **conservé jusqu'à ce que vous le supprimiez** : la rétention de 7 jours ne l'efface jamais, car c'est le seul moyen de revenir à la version précédente. Supprimez-le de `./backups` quand vous faites confiance à la mise à jour.
* S'il ne peut pas être écrit, rien n'est migré et l'API ne démarre pas : le journal de l'`api` dit pourquoi (voir Dépannage).
* Une sauvegarde manuelle avant la mise à jour (Admin → Configuration système → Sauvegardes → **Sauvegarder maintenant**) reste possible, mais n'est plus nécessaire.

> [!WARNING]
> Vous mettez à jour une instance déployée avant que `docker-compose.yml` n'exige `DB_PASSWORD` ? Elle tourne peut-être encore avec l'ancien mot de passe de repli, public dans l'historique git de ce dépôt. Changez-le : voir [Changer les secrets](./29-Rotation-Des-Secrets.md#changer-db_password).

## Mettre à jour
1. Notez les images utilisées pour pouvoir y revenir :
   ```bash
   docker compose images
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-api:latest
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-web:latest
   ```
   Conservez les deux lignes `…@sha256:…`.
2. Téléchargez et recréez : `docker compose pull && docker compose up -d`.
3. Surveillez le journal de l'API : `docker compose logs -f api`. Quand la mise à jour apporte des migrations, vous devez voir `[backup] Backup taken before migrating: /app/backups/glou-backup-before-migration-….sql.gz`, puis les migrations s'appliquer, puis `Server listening`. Sans migration : `[backup] No pending migration: no backup needed.`

## Revenir en arrière
Chaque build est aussi publié sous un tag immuable nommé d'après le hash de commit complet qui l'a généré (par ex. `ghcr.io/jackthomasanderson/glou-server-api:a1b2c3…`), en plus des tags `latest`/`beta` qui eux sont mutables. Contrairement à ceux-ci, ce tag n'est jamais réécrit : vous pouvez donc vous y fixer plutôt que de rechercher un digest. Retrouvez le commit que vous faisiez tourner (`git log`, ou le digest noté ci-dessous) et utilisez son tag SHA, ou revenez par **digest** si c'est tout ce que vous avez conservé.

1. Arrêtez la pile : `docker compose down` (cela conserve vos volumes).
2. Dans `docker-compose.yml`, fixez les deux images sur le tag SHA de commit voulu, par exemple `image: ghcr.io/jackthomasanderson/glou-server-api:a1b2c3…`, ou sur les digests notés, par ex. `image: ghcr.io/jackthomasanderson/glou-server-api@sha256:…`.
3. Démarrez seulement la base : `docker compose up -d db`.
4. Restaurez la sauvegarde faite avant la mise à jour (le fichier `glou-backup-before-migration-….sql.gz` du dossier `./backups`, à côté de `docker-compose.yml` ; si la mise à jour n'apportait aucune migration, votre dernier `glou-backup-….sql.gz`) avec les deux commandes de l'étape 3 de [Reprise après sinistre](./30-Reprise-Apres-Sinistre.md) : vérifiez le fichier, puis restaurez-le.
5. Démarrez tout : `docker compose up -d`. L'ancienne API trouve une base conforme à sa version et démarre normalement.

> [!CAUTION]
> Ne démarrez **pas** une ancienne API sur une base déjà migrée par une plus récente sans restaurer d'abord : elle peut tourner, mais avec des colonnes ou tables qu'elle ne connaît pas, et les données écrites entre-temps peuvent être perdues ou corrompues.

> [!NOTE]
> Tout ce qui a été saisi entre la sauvegarde et le retour arrière est perdu. Pour le conserver, exportez d'abord ce dont vous avez besoin (Profil → Données & confidentialité → Exporter).

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| L'API redémarre en boucle après une mise à jour, le journal montre une erreur de migration | Ne réessayez pas à l'aveugle. Lisez la première ligne d'erreur, gardez le journal, et revenez en arrière comme ci-dessus ; ouvrez ensuite une issue avec le journal. |
| `Erreur de migration Prisma` au premier démarrage | La base n'était pas encore prête : `docker compose restart api`. |
| L'API ne démarre pas, le journal montre `[backup] Migrations are pending, but /app/backups is not writable` | Docker a créé `./backups` en root. Rien n'a été migré. À côté de `docker-compose.yml` : `mkdir -p backups && sudo chown 1001:1001 backups`, puis `docker compose up -d`. |
| L'API ne démarre pas, le journal montre `[backup] Migrations are pending, but the backup taken before migrating failed: …` | Rien n'a été migré. Lisez la cause en fin de ligne : erreur de permission ou système de fichiers en lecture seule (`sudo chown 1001:1001 backups`), disque plein (libérez de la place). Puis `docker compose up -d`. |
| `[backup] Could not check for pending migrations` | La base n'était pas encore prête, ou `DATABASE_URL` est faux. Rien n'a été migré : `docker compose restart api`. |
