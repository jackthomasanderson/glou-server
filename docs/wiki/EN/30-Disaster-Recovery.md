# Disaster recovery: rebuild Glou on a new host

## TL;DR
Three things are needed to rebuild everything: the **database backup** (`.sql.gz`), your **`.env`** (same secrets), and the **photos** (the `api_uploads` Docker volume). The built-in backup covers the database only, and by default it is stored on the same host as the data: copy it somewhere else.

> [!IMPORTANT]
> **The photos are not in `./backups`.** A backup tool pointed at the project folder (restic, a NAS snapshot, rsync…) collects the database backups but not the photos: they stay in the `api_uploads` volume, under `/var/lib/docker`. Archive them with the command of [Back up the photos](#back-up-the-photos), and let your backup tool collect that archive too.

## What is (and is not) in a backup

| Data | Where it lives | In the built-in backup? |
|---|---|---|
| Accounts, inventory, cellars, tastings, settings | PostgreSQL (`db_data` volume) | Yes |
| Photos (bottle pictures, avatars, scan photos) | `api_uploads` volume (`/app/uploads`) | **No** |
| Backup files themselves | `./backups` folder, next to `docker-compose.yml` (`/app/backups` in the API container) | n/a |
| Secrets (`JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`) | your `.env` | **No** |

If the host disk dies, the backup files die with it unless you copied them elsewhere.

## Prerequisites (do this *before* you need it)
1. Backups enabled: Admin → System Configuration → Data → **Enabled**.
2. Regularly copy off the host: the newest file of the `./backups` folder (or **Download** it from the backup history), your `.env`, and the photo archive made by [Back up the photos](#back-up-the-photos).
   > [!NOTE]
   > If an old `api_backups` volume still exists, it only holds backups from before the 2026.10 upgrade; check the date before restoring one of them.
3. Know where your `docker-compose.yml` and `.env` are kept.

## Rebuild on a new host
1. Install Docker and put your `docker-compose.yml` and **the same `.env`** on the new host (in particular the same `CONFIG_ENCRYPTION_KEY`).
2. Start the stack: `docker compose up -d`. The API creates an empty database.
3. **In the app**, the simplest, when the new host runs the same Glou version as the one that took the backup:
   - Copy the backup file, keeping its name (`glou-backup-….sql.gz`), into the `./backups` folder next to `docker-compose.yml`, then restart the API: `docker compose restart api`. At startup, the API adds every backup file of that folder to the backup history (a truncated file is left out).
   - Create the first account: it is the admin of this still empty instance.
   - Open Admin → System configuration → Data, find the backup in the backup history and choose **Restore**. Glou asks for the password of the account you just created, then takes a backup of the current (empty) database, then restores.
   - Once restored, sign in with an account of the backup, then go on at step 6 (photos).

   If Glou answers that the backup was taken by another version, use the command line of steps 4 and 5 instead.
4. **Or from the command line.** Check the backup file is complete. This command prints nothing when the file is fine:
   ```bash
   gunzip -t glou-backup-XXXX.sql.gz
   ```
   > [!CAUTION]
   > Do not skip this. The command below replaces the whole database; if the file is truncated (interrupted copy, full disk) it can still end "successfully" on an empty or partial database. The in-app **Restore** button detects that case; this manual command does not.

   Then restore it:
   ```bash
   (printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n'; gunzip -c glou-backup-XXXX.sql.gz | sed '/^SET transaction_timeout/d') \
     | docker compose exec -T db psql -U glou -d glou_db -v ON_ERROR_STOP=1 --single-transaction
   ```
   An SQL error in the file aborts the whole restore and rolls back; a truncated file is what the `gunzip -t` check above is for. The `sed` part removes a setting that older backups contain and that PostgreSQL 15 rejects; it changes nothing in newer backups. If you changed `DB_USER` or `DB_NAME` in your `.env`, use those values instead of `glou` and `glou_db`.
5. Restart the API so it applies any database update the backup predates: `docker compose restart api`.
6. Restore the photos into the `api_uploads` volume, from the folder of your `docker-compose.yml`, with the stack started (step 2):
   ```bash
   gzip -t glou-photos.tar.gz
   docker compose exec -T -u 0 api sh -c 'tar xzf - -C /app/uploads && chown -R 1001:1001 /app/uploads' < glou-photos.tar.gz
   ```
   The first command prints nothing when the archive is complete. The second unpacks it into the volume and gives the files back to the API's user (`1001`).
7. Check: sign in, open a cellar, send a test email (Admin → System Configuration → Notifications → Email → Test connection).

## Back up the photos
The photos (bottle pictures, avatars, label scan photos) live in the `api_uploads` Docker volume, mounted on `/app/uploads` in the API container. They are **not** in the built-in backup and **not** in `./backups`. From the folder of your `docker-compose.yml`, with the stack running:
```bash
docker compose exec -T api tar czf - -C /app/uploads . > glou-photos.tar.gz.tmp && mv glou-photos.tar.gz.tmp glou-photos.tar.gz
```
This writes `glou-photos.tar.gz` next to `docker-compose.yml`, where a backup tool pointed at the project folder collects it. Keep `-T`: without it, the archive is damaged. The archive is written to a `.tmp` file first and only replaces the previous one when the command succeeds (stack stopped, disk full…). Check it:
```bash
gzip -t glou-photos.tar.gz && tar tzf glou-photos.tar.gz | head
```
The first part prints nothing when the archive is complete; the second lists the first files (`./products/…`, `./avatars/…`).

To make it every night, add a line to the crontab of a user allowed to run `docker` (`crontab -e`), for example at 03:30, after the database backup:
```bash
30 3 * * * cd /path/to/glou && docker compose exec -T api tar czf - -C /app/uploads . > glou-photos.tar.gz.tmp && mv glou-photos.tar.gz.tmp glou-photos.tar.gz
```
Do not write this archive inside `./backups`: that folder is for the database backups Glou makes and lists itself.

To restore it, see step 6 of [Rebuild on a new host](#rebuild-on-a-new-host); the same command restores the photos on the same host.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The copied backup is not in the backup history | Restart the API after copying the file (`docker compose restart api`), keep its `glou-backup-` name and `.sql.gz` extension, and make sure the API can read it (`sudo chown 1001:1001 backups/*`). A truncated file is never listed: check it with `gunzip -t`. |
| `gunzip -t` reports `unexpected end of file` or `not in gzip format` | The file is incomplete: copy it again, or use an older backup. Do not restore it. |
| The restore stops with `already exists` errors | The schema was not reset: keep the first `printf` line of the command. |
| The restore stops with `unrecognized configuration parameter "transaction_timeout"` | The `sed '/^SET transaction_timeout/d'` part of the command is missing: copy the whole command again. |
| The restore stops with `invalid command \restrict` | The database image on this host is older than PostgreSQL 15.14: update it with `docker compose pull db && docker compose up -d db`, then run the command again. |
| Everything is back but emails/Gotify fail | `CONFIG_ENCRYPTION_KEY` differs from the one the backup was made with. Use the original `.env`, or re-enter the settings as described in [Rotate the secrets](./29-Secret-Rotation.md). |
| Bottle pictures are missing | The photos were not restored: they are not part of the database backup nor of `./backups`. Restore the photo archive (step 6). |
