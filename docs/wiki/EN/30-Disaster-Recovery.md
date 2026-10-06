# Disaster Recovery: Rebuild Glou on a New Host

## TL;DR
Three things are needed to rebuild everything: the **database backup** (`.sql.gz`), your **`.env`** (same secrets), and the **photo volume** (`api_uploads`). The built-in backup covers the database only, and by default it is stored on the same host as the data — copy it somewhere else.

## What is (and is not) in a backup

| Data | Where it lives | In the built-in backup? |
|---|---|---|
| Accounts, inventory, cellars, tastings, settings | PostgreSQL (`db_data` volume) | Yes |
| Photos (bottle pictures, avatars, scan photos) | `api_uploads` volume (`/app/uploads`) | **No** |
| Backup files themselves | `api_backups` volume (`/app/backups`) | n/a |
| Secrets (`JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`) | your `.env` | **No** |

If the host disk dies, the backup files die with it unless you copied them elsewhere.

## Prerequisites (do this *before* you need it)
1. Backups enabled: Admin → System Configuration → Backups → **Enabled**.
2. Regularly copy off the host: the newest file of the `api_backups` volume (or **Download** it from the backup history), your `.env`, and the `api_uploads` volume.
3. Know where your `docker-compose.yml` and `.env` are kept.

## Rebuild on a new host
1. Install Docker and put your `docker-compose.yml` and **the same `.env`** on the new host (in particular the same `CONFIG_ENCRYPTION_KEY`).
2. Start the stack: `docker compose up -d`. The API creates an empty database.
3. Check the backup file is complete — this command prints nothing when the file is fine:
   ```bash
   gunzip -t glou-backup-XXXX.sql.gz
   ```
   > [!CAUTION]
   > Do not skip this. The command below replaces the whole database; if the file is truncated (interrupted copy, full disk) it can still end "successfully" on an empty or partial database. The in-app **Restore** button detects that case; this manual command does not.

   Then restore it:
   ```bash
   (printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n'; gunzip -c glou-backup-XXXX.sql.gz) \
     | docker compose exec -T db psql -U glou -d glou_db -v ON_ERROR_STOP=1 --single-transaction
   ```
   An SQL error in the file aborts the whole restore and rolls back; a truncated file is what the `gunzip -t` check above is for.
4. Restart the API so it applies any database update the backup predates: `docker compose restart api`.
5. Restore the photos into the `api_uploads` volume, for example:
   ```bash
   docker run --rm -v <project>_api_uploads:/data -v "$PWD":/backup alpine \
     sh -c 'cd /data && tar xzf /backup/uploads.tar.gz && chown -R 1001:1001 /data'
   ```
6. Check: sign in, open a cellar, send a test email (Admin → System Configuration → SMTP → test).

## Back up the photos
```bash
docker run --rm -v <project>_api_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads.tar.gz -C /data .
```
Replace `<project>` with the prefix shown by `docker volume ls` (usually the folder name of your compose file).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `gunzip -t` reports `unexpected end of file` or `not in gzip format` | The file is incomplete: copy it again, or use an older backup. Do not restore it. |
| The restore stops with `already exists` errors | The schema was not reset: keep the first `printf` line of the command. |
| Everything is back but emails/Gotify fail | `CONFIG_ENCRYPTION_KEY` differs from the one the backup was made with. Use the original `.env`, or re-enter the settings as described in [Rotate the secrets](./29-Secret-Rotation.md). |
| Bottle pictures are missing | The photo volume was not restored (it is not part of the database backup). |
