# Upgrade Glou and Go Back If Something Goes Wrong

## TL;DR
Glou applies its database migrations automatically when the API starts, and **migrations only go forward** — there is no "down" migration. Going back means restoring the backup you took before the upgrade, with the previous image. Take that backup first, and note the image you are running.

## Prerequisites
* Shell access to the host, and a **fresh backup** (Admin → System Configuration → Backups → **Run now**).
* The database backup alone is enough to undo schema changes; photos are not touched by migrations.

## Upgrade
1. Back up (see above) and note the images in use so you can return to them:
   ```bash
   docker compose images
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-api:latest
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-web:latest
   ```
   Keep the two `…@sha256:…` lines.
2. Pull and recreate: `docker compose pull && docker compose up -d`.
3. Watch the API log: `docker compose logs -f api`. You should see the migrations apply, then `Server listening`.

## Go back
Images are only published as `latest` (stable) and `beta`: there is no version tag, so you go back by **digest**.

1. Stop the stack: `docker compose down` (this keeps your volumes).
2. In `docker-compose.yml`, pin the two images to the digests you noted, for example `image: ghcr.io/jackthomasanderson/glou-server-api@sha256:…`.
3. Start only the database: `docker compose up -d db`.
4. Restore the backup taken before the upgrade, with the command of [Disaster recovery](./30-Disaster-Recovery.md) step 3.
5. Start everything: `docker compose up -d`. The older API finds a database matching its own version and starts normally.

> [!CAUTION]
> Do **not** start an older API on a database already migrated by a newer one without restoring first: it may run, but with columns or tables it does not know about, and data written meanwhile can be lost or corrupted.

> [!NOTE]
> Everything entered between the backup and the rollback is lost. To keep it, export what you need first (Profile → Data & Privacy → Export).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The API restarts in a loop after an upgrade, the log shows a migration error | Do not retry blindly. Read the first error line, keep the log, and go back as above; then open an issue with the log. |
| `Prisma migration error on startup` at first start | The database was not ready yet: `docker compose restart api`. |
