# Schedule backups, restore your data & export a filtered copy

## TL;DR
Schedule database backups from Admin, restore one when needed, export your own data (in full or filtered by category) from your Profile, and check who has had access to your account.

## Prerequisites
* Admin account for scheduling/restoring backups.
* Regular account for exporting your own data.

## Action

### Schedule automatic backups (admin)
> [!IMPORTANT]
> Backups are **on by default on new installations**. An instance installed before this default existed keeps its previous setting, which was **off**: open the panel below and check that **Enabled** is on.

1. Go to **Admin → System Configuration → Backups**.
2. Make sure the **Enabled** switch is on.
3. Set **Retention** (days to keep old backup files, default `7`) and **Hour (UTC)** (hour of day the daily backup runs, default `3`).
4. Click **Save**.

> [!TIP]
> The scheduler ticks every hour and produces a dump when the switch is on and the current UTC hour matches your configured hour. It therefore runs once a day, and toggling **Enabled** takes effect on the next tick, with no restart.
>
> Missed backups are caught up. If the container was stopped or restarting at your configured hour, the backup runs at the next hourly tick: any time the last successful backup is more than 25 hours old, a new one is taken.
>
> Failures are reported. If a scheduled backup fails (full disk, database unreachable…), every administrator is notified through their enabled channels (email, Gotify/webhook), once per failure streak, then again after 24 hours if it keeps failing, not every hour. The category is called **Backup failures (admin)** in Profile → Notifications. Old backup files are only deleted after a *successful* backup, so a failing run never wipes the last good dump.

### Run a backup immediately
1. In the same tab, click **Run now**.
2. Once complete, the new run appears at the top of the history with its file size.

### Restore a backup
1. Find the run you want in the backup history and click **Restore**.

   > [!CAUTION]
   > Restoring is destructive: it overwrites **all current data** with the content of that backup file. There is no undo. The dialog requires you to type a confirmation keyword before the **Confirm** button becomes clickable.

2. Confirm. The restore is logged in the audit trail regardless of whether it succeeds or fails.
3. The restore is all-or-nothing: if the backup file is damaged or incomplete, it fails and your current data is untouched. After restoring a backup made by an **older version** of Glou, restart the API (`docker compose restart api`) so it applies any database update the backup predates.
4. You can also **Download** a backup file directly from the history list instead of restoring it in place.

### Export your data (full or filtered by category)
1. Go to **Profile → Data & Privacy (GDPR section)**.
2. Click **Export** for a complete export of your data, or click **Filter** to expand a category picker and select only what you need: **inventory**, **cellars**, **collections**, **tastings**, **activity**, **wishlist**, **budgets**, **consumption goals**, **stock counts**, **humidor readings**, **sessions**, **trusted devices**, **notification preferences**, **configuration history**. The file has an `included` key listing the categories actually exported. The exported activity covers everything the retention window still keeps (no arbitrary row cap). Sessions and trusted devices are exported as descriptive metadata only (device, approximate location, dates). The token that authenticates them is never exported, nor is any other secret (password, 2FA).
3. Click **Export selection**. The file downloads as `glou-export.json`: plain JSON, readable by any text editor or script.

### Back up `.env` too, separately
Database dumps hold your inventory, your tastings, your configuration history — but `CONFIG_ENCRYPTION_KEY` (in `.env`, never in the database) is the only key that decrypts the secrets a dump carries at rest (SMTP password, Gotify/webhook URL, API keys). Restoring a dump on an instance whose `.env` has a *different* `CONFIG_ENCRYPTION_KEY` makes those fields unreadable — Glou doesn't fail the restore, but Administration → System Configuration will show them empty and they'll need to be re-entered.

Back up `.env` wherever you already keep secrets (a password manager, an encrypted vault) — not inside the `backups/` directory itself, since that's meant for dumps your backup tool collects on its own schedule, not for a file that rarely changes and should be handled with more care than a rotating batch of dumps.

### Where backups actually live, and proving a restore works
Backup dumps land in `./backups` on the **host**, bind-mounted into the container (`docker-compose.yml`), not in a Docker-managed named volume — so whatever backup tool you already run on the host (`restic`, a NAS snapshot, `rsync` to another machine…) sees and collects them on its own, and a disk failure doesn't take out the database and its backups together.

A restore actually working isn't just asserted here: `e2e/tests/backup-restore.spec.ts` runs a real backup → create data → restore → confirm the new data is gone cycle against a live instance on every CI run (see `.github/workflows/docker-publish.yml`'s `e2e` job) — a continuously re-verified proof, rather than a single dated note that goes stale the moment something changes.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **Backups are enabled but no file ever appears** | Check the **Hour (UTC)** value against the current UTC time: the job only fires during that hour once enabled. Or click **Run now** to test immediately. |
| **I clicked Restore and now my data is different than before** | Expected: restore overwrites all current data with the backup's content. If this was a mistake, restore a more recent backup (or the pre-restore state if you took a manual backup right before). |
| **My export file only has some of my data** | You used **Filter** and only selected certain categories. Use the plain **Export** button for a full export instead. |
| **Where are backup files actually stored?** | `./backups` on the host (bind-mounted, see above) — point your own backup tool at that directory. |
| **A restored backup's SMTP/Gotify/API-key fields are empty** | The dump was taken (or is being restored) on an instance whose `.env` has a different `CONFIG_ENCRYPTION_KEY` than the one that encrypted those fields. Re-enter them, and keep `CONFIG_ENCRYPTION_KEY` backed up with your other secrets — see "Back up `.env` too, separately" above. |
