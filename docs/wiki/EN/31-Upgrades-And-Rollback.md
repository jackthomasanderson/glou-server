# Upgrade Glou and go back if something goes wrong

## TL;DR
Glou applies its database migrations automatically when the API starts, and **migrations only go forward**: there is no "down" migration. Going back means restoring the backup taken before the upgrade, with the previous image. **Glou takes that backup itself** when an update brings database migrations: a `glou-backup-before-migration-<date>.sql.gz` file in the `./backups` folder, next to `docker-compose.yml`. Note the image you are running before you update.

## Prerequisites
* Shell access to the host.
* On Linux, the `backups` folder next to `docker-compose.yml` must belong to uid 1001: `mkdir -p backups && sudo chown 1001:1001 backups`. Otherwise the automatic backup fails, and the API does not start (nothing is migrated).
* With Portainer, Synology Container Manager or another UI, there is no such folder: map `/app/backups` to an absolute host path owned by uid 1001 (see [Installation](./01-Installation.md), **Portainer, Synology Container Manager or another UI**). The UI only reports the `api` container as unhealthy; the reason is in its log (**Containers → `<stack>-api-1` → Logs** in Portainer).
* The database backup alone is enough to undo schema changes; photos are not touched by migrations.

## The backup taken before migrating
* When the API starts and finds migrations it has not applied yet, on an instance that already has at least one account, it first backs up the whole database, with the same `pg_dump` as the nightly backup. A new installation or an update without migrations takes no such backup.
* The file is `./backups/glou-backup-before-migration-<date>.sql.gz` (`/app/backups` inside the container). Once the API has started, it is also listed in Admin → System Configuration → Backups, where you can download it.
* It is **kept until you delete it**: retention (7 days by default) never removes it, since it is the only way back to the previous version. Delete it from `./backups` once you trust the update.
* If it cannot be written, nothing is migrated and the API does not start: the `api` log says why (see Troubleshooting).
* A manual backup before updating (Admin → System Configuration → Backups → **Back up now**) remains possible, but is no longer needed.

> [!WARNING]
> Upgrading from an instance deployed before `docker-compose.yml` required `DB_PASSWORD`? It may still be running on the old fallback database password, which is public in this repo's git history. Rotate it: see [Rotate the Secrets](./29-Secret-Rotation.md#rotate-db_password).

## Upgrade
1. Note the images in use so you can return to them:
   ```bash
   docker compose images
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-api:latest
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-web:latest
   ```
   Keep the two `…@sha256:…` lines.
2. Pull and recreate: `docker compose pull && docker compose up -d`.
3. Watch the API log: `docker compose logs -f api`. When the update brings migrations, you should see `[backup] Backup taken before migrating: /app/backups/glou-backup-before-migration-….sql.gz`, then the migrations apply, then `Server listening`. Without migrations: `[backup] No pending migration: no backup needed.`

## The update that groups your bottles into lines
An update can transform your data. The one that introduces **lines of identical bottles** (one wine = one card, "×6") does it **once**, the first time the API starts, after the automatic backup. It is applied entirely or not at all, and before finishing it checks that your totals (number of bottles and cigars, value, spending, tastings, history, cellar-plan slots, collections, counts) are identical to the ones before: at the slightest difference it cancels itself and the API does not start (see Troubleshooting). It takes a few seconds for a few thousand bottles.

What changes in your data:
* **Identical bottles are grouped.** The records of the same wine (same category, producer, name and vintage, ignoring case and spaces) become a single wine when their descriptions do not contradict each other (an empty value is not a disagreement). Strictly identical bottles (same cellar, price, bottle size, purchase date and estimated value, with a purchase place and a location that do not contradict each other, none opened) make a line "×N"; a wine bought again on another date keeps one line per date. Bottles flagged "to check" are never fused. Before the update no bottle had a purchase date: for bottles already recorded it is the day you added them to Glou, so 6 identical bottles entered on two different days make two lines, and the budget counts each at that day. Photos and notes that differ do not block it: the most recent photo is kept (the others stay viewable) and the notes are put end to end with their date. Opened bottles, those in a cellar-plan slot (brought together by the next update, see below) or counted in the same stock count session stay lines of their own.
* **Quantities.** An empty quantity counts as 1. A quantity above 1 typed with the old "Increment quantity" button is kept and finally counts.
* **Cigars** become **boxes** holding the number of cigars they had left: closed, or opened if the record was opened; an emptied record becomes a finished box.
* **"Known but not owned" wines** (former references) become wines **without a bottle**, visible under the **No longer in the cellar** filter.
* **Opened or finished records counting several bottles** (an old record with quantity 3, opened) are split as best Glou can: one opened (or finished) bottle and the rest as full bottles. Glou cannot guess right every time: these cases are flagged in **To check**.
* **Bulk-action templates** that wrote a state (opened, level, opening date) are deleted entirely.
* In rare cases (more than 200 characters of different collection labels), the surplus is added to the wine's notes, dated and preceded by "Libellés d'origine :" (all the labels are copied there, not only the surplus). The same mention is written when you merge wines under **Merge?**. It is in French whatever your language.

### To check after the update
What Glou could not settle on its own is listed under **To check after the update**, behind a banner on the wine list (**View** / **Later**; **Later** postpones it to your next sign-in). A point settled by one member disappears for everyone.
* **Merge?**: wines of the same name kept apart because their descriptions contradicted each other (region, colour, peak…). Only the fields in disagreement are shown side by side, already ticked on the most recent wine: tick the value to keep then **Merge** (final), or **It's another wine**: the two wines will never be suggested together again. Notes over 2,000 characters or more than 20 tags are kept but must be shortened before the description is edited.
* **Numbers to check**: a line split as best as possible, with what it was before the update ("Before the update: 3 bottles, opened. Glou counted 1 opened + 2 full"). **That's right** confirms, **Correct the number** adjusts.
Nothing is lost if you do nothing: wines stay separate, numbers stay what Glou counted. The **movement journal** does not exist yet in this version; the history of earlier changes remains viewable on each wine.

## The update that gives each bottle of the plan its own slot
The update that lets a line take several slots of the cellar plan (one slot per bottle) also transforms your data **once**, the first time the API starts, after the automatic backup. It is applied entirely or not at all, and before finishing it checks that your totals (number of bottles and cigars, value and spending per category), tastings, history, stock counts, wishlist and **every occupied slot** are the same as before: at the slightest difference it cancels itself and the API does not start (see Troubleshooting).

What changes in your data:
* **Every occupied slot is kept**, with its bottle, including the slot of a bottle in the trash (restored, the bottle gets its slot back if it is still free).
* **Identical lines left apart** at the previous update **only because each had its slot** are brought together into one line that keeps all their slots. The rules are the previous update's (same wine, cellar, price, bottle size, purchase date and estimated value, a purchase place and location that do not contradict each other, none opened or "to check"); two lines counted in the same stock count session stay apart.
* **Single cigars** are never brought together when each held a slot: a group of single cigars takes only one slot.
* **Coordinates without a cellar** (a bottle taken out of its cellar that kept its position) are dropped, like those of a drunk or written-off bottle, half-filled ones, or ones outside the possible values (1 to 100). They showed on no plan.

To go back, restore `glou-backup-before-migration-….sql.gz` with the previous image (see below): everything you entered after the update is lost.

## Go back
Every stable release is published under an immutable version tag such as `v2026.10.0` (`vYYYY.MM`, or `vYYYY.MM.PATCH`), alongside the mutable `latest`/`beta` tags. Unlike those, a version tag is never overwritten: **pin the two images to the tag of the release you were running before the update** (the list of releases is in the CHANGELOG, or on the GHCR packages page). You do not need a copy of the repository or a noted digest.

Fallbacks if you do not know that release: every build is also published under a tag named `sha-` followed by the full commit SHA it was built from (e.g. `…glou-server-api:sha-a1b2c3…`), and you can go back by **digest** if you noted it before updating. To read the commit of an image still on the host: `docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' <image>` prints the bare SHA: pin the image to `:sha-` followed by it.

1. Stop the stack: `docker compose down` (this keeps your volumes).
2. In `docker-compose.yml`, pin the two images to the release tag you want, for example `image: ghcr.io/jackthomasanderson/glou-server-api:v2026.10.0` (same for `glou-server-web`), or, as a fallback, to a `sha-…` commit tag or the digests you noted, e.g. `image: ghcr.io/jackthomasanderson/glou-server-api@sha256:…`.
3. Start only the database: `docker compose up -d db`.
4. Restore the backup taken before the upgrade (the `glou-backup-before-migration-….sql.gz` file in the `./backups` folder, next to `docker-compose.yml`; if the update brought no migration, your latest `glou-backup-….sql.gz`) with the two commands of [Disaster recovery](./30-Disaster-Recovery.md) step 3: check the file, then restore it.
5. Start everything: `docker compose up -d`. The older API finds a database matching its own version and starts normally.

> [!CAUTION]
> Do **not** start an older API on a database already migrated by a newer one without restoring first: it may run, but with columns or tables it does not know about, and data written meanwhile can be lost or corrupted.

> [!NOTE]
> Everything entered between the backup and the rollback is lost. To keep it, export what you need first (Profile → Data & Privacy → Export).

> [!WARNING]
> For an update that transforms your data like this one, going back **is only done by restoring** `glou-backup-before-migration-….sql.gz` with the previous image: going back while keeping the current data is impossible, as it has another format. Everything you entered after the update (bottles added or drunk, tastings, "To check" points settled) is lost. If you restore this backup while keeping the **new** version, the transformation runs again when the API restarts, and the "To check" points come back. Restoring this backup with the **Restore** button of the admin area is refused: a backup from another version is restored with the command of [Disaster recovery](./30-Disaster-Recovery.md).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The API restarts in a loop after an upgrade, the log shows a migration error | Do not retry blindly. Each restart reuses the backup already taken (`[backup] … No new backup: …`), so the loop does not fill the disk. Read the first error line, keep the log, and go back as above; then open an issue with the log. |
| The API log shows a migration error starting with `families:` or `slots:` (a total or a slot does not match) | The update cancelled itself and your data is intact ("P3009" at the next restart: the migration is marked failed). Force nothing: keep the log, go back to the previous image (see above) and open an issue with that log. |
| `Prisma migration error on startup` at first start | The database was not ready yet: `docker compose restart api`. |
| The API does not start, the log shows `[backup] Migrations are pending, but /app/backups is not writable` | Docker created `./backups` as root. Nothing was migrated. Next to `docker-compose.yml`: `mkdir -p backups && sudo chown 1001:1001 backups`, then `docker compose up -d`. With Portainer or another UI (which only says the `api` container is unhealthy): replace `./backups` with an absolute host path owned by uid 1001 (`sudo mkdir -p /opt/glou/backups && sudo chown 1001:1001 /opt/glou/backups`), then redeploy the stack. |
| The API does not start, the log shows `[backup] Migrations are pending, but the backup taken before migrating failed: …` | Nothing was migrated. Read the reason at the end of the line: a permission or read-only error (`sudo chown 1001:1001 backups`), no space left (free disk space). Then `docker compose up -d`. |
| `[backup] Could not check for pending migrations` | The database was not ready yet, or `DATABASE_URL` is wrong. Nothing was migrated: `docker compose restart api`. |
