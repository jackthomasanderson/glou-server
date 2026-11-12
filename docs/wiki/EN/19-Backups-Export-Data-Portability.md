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

1. Go to **Admin → System Configuration → Data**.
2. Make sure the **Enabled** switch is on.
3. Set **Retention** (days to keep old backup files, default `7`) and **Run time** (hour of day the daily backup runs, default `03:00`, in the server's time zone `TZ`, shown under the field).
4. Click **Save**. Turning backups off, or keeping their files for fewer days than before, is confirmed with your password, plus your code if your account has two-factor authentication.

> [!TIP]
> The scheduler ticks every hour and produces a dump when the switch is on and the current hour, in the server's time zone, matches your configured hour. It therefore runs once a day, and toggling **Enabled** takes effect on the next tick, with no restart.
>
> Missed backups are caught up. If the container was stopped or restarting at your configured hour, the backup runs at the next hourly tick: any time the last successful backup is more than 25 hours old, a new one is taken.
>
> Failures are reported. While the last backup run has failed (full disk, database unreachable…), or the last successful one is more than 48 hours old while backups are on, every administrator sees a red banner at the top of every page, with a link to **Admin → System Configuration → Data**. It needs no email or Gotify, and it goes away once a backup succeeds. Members never see it. Administrators who turned on email or Gotify are also notified there, once per failure streak, then again after 24 hours if it keeps failing, not every hour: the category is called **Backup failures (admin)** in Profile → Notifications. Old backup files are only deleted after a *successful* backup, so a failing run never wipes the last good dump.

### Run a backup immediately
1. In the same tab, click **Back up now**.
2. Once complete, the new run appears at the top of the history with its file size.

### Restore a backup
1. Find the run you want in the backup history and click **Restore**.

   > [!CAUTION]
   > Restoring is destructive: it overwrites **all current data** with the content of that backup file. The dialog requires you to type a confirmation keyword; then you confirm with your password, plus a code from your authenticator app (or a backup code) if your account has two-factor authentication.

2. Confirm. A backup of the current data is taken first and added to the history: to undo the restore, restore that backup. If this safety backup fails (full disk…), nothing is restored and your data is untouched. The restore is logged in the audit trail regardless of whether it succeeds or fails.
3. The restore is all-or-nothing: if the backup file is damaged or incomplete, it fails and your current data is untouched. A backup made by **another version** of Glou is refused here, and nothing is restored: an older one (such as the `glou-backup-before-migration-…` file taken before an update) or a newer one. To go back to the older version with its data, follow [Go back](./31-Upgrades-And-Rollback.md#go-back). To stay on the current version with the data of that backup, restore it with the command of step 4 of [Disaster recovery](./30-Disaster-Recovery.md), then restart the API (`docker compose restart api`): Glou backs the data up, then updates it.
4. You can also **Download** a backup file directly from the history list instead of restoring it in place. It is confirmed the same way: your password, plus your code if your account has two-factor authentication. An open admin session alone can neither download, restore nor purge.
5. After a restore, the history still lists every backup file of `./backups`, including those newer than the restored one. A backup file copied by hand into `./backups` (for example to recover on a new machine) appears in the history after an API restart (`docker compose restart api`); it can then be restored or downloaded like any other. Keep its original name (`glou-backup-<date>.sql.gz`): the date shown comes from it, while a renamed file is dated by its last modification. A damaged or incomplete file is not listed (the API logs say why).

### Export your data (full or filtered by category)
1. Go to **Profile → Data & Privacy (GDPR section)**.
2. Click **Export** for a complete export of your data, or click **Filter** to expand a category picker and select only what you need: **inventory**, **cellars**, **collections**, **tastings**, **activity**, **wishlist**, **budgets**, **consumption goals**, **stock counts**, **humidor readings**, **sessions**, **trusted devices**, **notification preferences**, **configuration history**. The file has an `included` key listing the categories actually exported. The exported activity covers everything the retention window still keeps (no arbitrary row cap). Sessions and trusted devices are exported as descriptive metadata only (device, approximate location, dates). The token that authenticates them is never exported, nor is any other secret (password, 2FA).
3. Click **Export selection**. The file downloads as `glou-export.json`: plain JSON, readable by any text editor or script.

### Delete an account: what is deleted, what stays
* **Your own account**: **Profile → Data & Privacy → Delete account**, with your password. The deletion is carried out 30 days later (you can cancel until then). **Deleted**: your sign-in details and profile (name, e-mail, avatar, app name and slogan, two-factor, PIN), your wishlist, consumption goals, saved bulk-edit presets, label scans and their photos, sessions, trusted devices, password-reset links and the guest links you created. **Kept for the household, without your name** (shown as "deleted-…"): the cellars and bottles you added, your tastings, stock counts, humidor readings, budgets and collections — collections are shared by the household. Export your data first if you want a copy.
* **A member who left (admin)**: in **Admin → Member Management**, each member has **Export their data** (the same JSON file as above, after your password), **Schedule account deletion** (carried out after the same 30 days, deleting and keeping the same things; it can be cancelled until then) and **Delete account now**. Both work for a deactivated member, who can no longer sign in to do it themselves; a member deactivated after asking for deletion is deleted on schedule too.
* **Delete account now (admin)** deletes the account for good, after your password. The same personal data is deleted; what the member created in the shared cellar (cellars, wines and bottles, tastings, counts, humidor readings, budgets) is attributed to you, their collections stay, and the audit log keeps their past actions under their name, with an entry saying who deleted them. You cannot delete your own account from there, nor the last administrator.

### Export your cellar as CSV
In **Profile → Data & Privacy**, **Export as CSV** downloads a spreadsheet of your cellar that you open in a spreadsheet application and that the [file import](./17-Onboarding-Setup-Wizard.md#importing-a-csv-file) reads back as is (a group of bottles re-imports without loss).
* **What it contains**: **one row per line of bottles** in the cellar (with its quantity), plus one row per **opened** bottle or box; the cellar, price and purchase date, the bottle size (or the vitola and box size for a cigar), the level and opening date, purchase place, location, estimated value, "To check", and the wine's description (colour, appellation, grapes, tags, notes, drinking window, spirit and cigar fields…).
* **Language**: in French, French headers, `;` separator and decimal comma (a French spreadsheet opens it directly, accents included); in English, English headers, `,` and a decimal point. The import reads both.
* **What it does not contain**: photos, tastings, history, alerts and reminders, cellar-plan slots, and bottles that are **drunk, written off or in the trash**: all of that is only in the full JSON export above. Cells starting like a spreadsheet formula are neutralized, and the import removes that mark.
* **Limits of re-importing**: a `|` inside a tag or grape variety splits it in two; an empty purchase date is re-imported as today; the import takes **500 rows** at a time (a warning appears beyond, with what to do for the 2nd part); the description of an already-known wine is never changed by the import.
* Re-importing into the same cellar: choose **Ignore (already counted)** for wines already in the cellar (the default), otherwise the bottles would be counted twice.

### Back up `.env` too, separately
Database dumps hold your inventory, your tastings, your configuration history — but `CONFIG_ENCRYPTION_KEY` (in `.env`, never in the database) is the only key that decrypts the secrets a dump carries at rest (SMTP password, Gotify application token, API keys, and each member's two-factor secret). Restoring a dump on an instance whose `.env` has a *different* `CONFIG_ENCRYPTION_KEY` makes those fields unreadable — Glou doesn't fail the restore, but Administration → System Configuration will show them empty and they'll need to be re-entered, and the codes of authenticator apps are refused: members sign in with one of their backup codes, then turn two-factor authentication off and on again (see [Lost phone](./32-Lost-Phone-2FA.md)).

Since the two-factor secrets are encrypted, a dump on its own no longer gives anyone the codes of your members' authenticator apps — as long as `CONFIG_ENCRYPTION_KEY` is not stored with it. Secrets saved before this version are encrypted when the API starts, before each backup and after a restore.

> [!WARNING]
> Backups taken **before** this version still contain the two-factor secrets in the clear. Delete the copies your backup tool keeps elsewhere (restic, NAS, another machine…), or have every member with two-factor authentication set it up again (turn it off, then on, in **Profile → Security & Authentication**): the old secrets then no longer give any valid code.

Back up `.env` wherever you already keep secrets (a password manager, an encrypted vault) — not inside the `backups/` directory itself, nor on the storage your backup tool copies `backups/` to, since that's meant for dumps your backup tool collects on its own schedule, not for a file that rarely changes and should be handled with more care than a rotating batch of dumps.

### Where backups actually live, and proving a restore works
Backup dumps land in `./backups` on the **host**, bind-mounted into the container (`docker-compose.yml`), not in a Docker-managed named volume — so whatever backup tool you already run on the host (`restic`, a NAS snapshot, `rsync` to another machine…) sees and collects them on its own, and a disk failure doesn't take out the database and its backups together.

A restore actually working isn't just asserted here: `e2e/tests/backup-restore.spec.ts` runs a real backup → create data → restore → confirm the new data is gone, and that the safety backup and the newer backups are still listed, cycle against a live instance on every CI run (see `.github/workflows/docker-publish.yml`'s `e2e` job) — a continuously re-verified proof, rather than a single dated note that goes stale the moment something changes.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **Backups are enabled but no file ever appears** | Check the **Run time** value against the current time of the server's time zone (shown under the field): the job only fires during that hour once enabled. Or click **Back up now** to test immediately. |
| **I clicked Restore and now my data is different than before** | Expected: restore overwrites all current data with the backup's content. If this was a mistake, restore the backup taken automatically just before the restore: it is the most recent **Manual** entry of the history. |
| **The restore was refused: the backup taken before the restore failed** | Nothing was restored. The failed backup is in the history with its error: fix the cause (usually disk space or the `./backups` permissions), then restore again. |
| **My export file only has some of my data** | You used **Filter** and only selected certain categories. Use the plain **Export** button for a full export instead. |
| **Where are backup files actually stored?** | `./backups` on the host (bind-mounted, see above) — point your own backup tool at that directory. |
| **After a restore, authenticator codes are refused** | Same cause: a different `CONFIG_ENCRYPTION_KEY`. Put the old key back in `.env` and `docker compose up -d api`; otherwise each member signs in with a backup code and sets two-factor authentication up again ([Lost phone](./32-Lost-Phone-2FA.md)). |
| **A restored backup's SMTP/Gotify/API-key fields are empty** | The dump was taken (or is being restored) on an instance whose `.env` has a different `CONFIG_ENCRYPTION_KEY` than the one that encrypted those fields. Re-enter them, and keep `CONFIG_ENCRYPTION_KEY` backed up with your other secrets — see "Back up `.env` too, separately" above. |
