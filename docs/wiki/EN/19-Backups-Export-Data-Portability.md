# Schedule Backups, Restore Your Data & Export a Filtered Copy

## TL;DR
Turn on scheduled database backups from Admin, restore one when things go wrong, export your own data (in full or filtered by category) from your Profile, and check who's had access to your account.

## Prerequisites
* Admin account for scheduling/restoring backups.
* Regular account for exporting your own data and viewing the access transparency panel.

## Action

### Schedule automatic backups (admin)
1. Go to **Admin → System Configuration → Backups**.
2. Flip the **Enabled** switch on.
3. Set **Retention** (days to keep old backup files — default `7`) and **Hour (UTC)** (the hour of day the daily backup runs — default `3`).
4. Click **Save**.

> [!TIP]
> The scheduler ticks every hour and only produces a dump when both the switch is on and the current UTC hour matches your configured hour — so it effectively runs once a day, and toggling **Enabled** takes effect on the very next tick, no restart needed.

### Run a backup immediately
1. In the same tab, click **Run now**.
2. The new run appears at the top of the history with its file size, once complete.

### Restore a backup
1. Find the run you want in the backup history and click **Restore**.

   > [!CAUTION]
   > Restoring is destructive: it overwrites **all current data** with the content of that backup file. There is no undo. The dialog requires you to type a confirmation keyword before the **Confirm** button becomes clickable — read it carefully before typing.

2. Confirm. The restore is logged in the audit trail regardless of whether it succeeds or fails.
3. You can also **Download** a backup file directly from the history list instead of restoring it in place.

### Export your data (full or filtered by category)
1. Go to **Profile → Data & Privacy (GDPR section)**.
2. Click **Export** for a complete export of your data, or click **Filter** to expand a category picker and select only what you need: **inventory**, **cellars**, **collections**, **tastings**, **activity**.
3. Click **Export selection**. The file downloads as `glou-export.json` — plain JSON, readable by any text editor or script.

### Check the access transparency panel
1. On your **Profile** page, the transparency panel shows two lists:
   - **Active sessions** — device, last activity, and a badge marking your current session. Click **Manage** to go revoke one.
   - **Active shares** — each active guest share, its expiration (or "no expiration"), and whether it grants partial write access. Click **Manage** to go revoke one.
2. This panel is read-only by design — actual revocation happens on the dedicated Sessions and Guest Shares panels it links to, so there's a single place that performs the action.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **Backups are enabled but no file ever appears** | Check the **Hour (UTC)** value against the current UTC time — the job only fires during that specific hour, once toggled on. Or click **Run now** to test the mechanism immediately. |
| **I clicked Restore and now my data is different than before** | That's expected — restore overwrites all current data with the backup's content. If this was a mistake, restore a more recent backup (or the pre-restore state if you took a manual backup right before). |
| **My export file only has some of my data** | You used **Filter** and only selected certain categories. Use the plain **Export** button for a full export instead. |
| **Where are backup files actually stored?** | Inside the API container's `backups/` directory. If you're running in Docker and want backups to survive a container rebuild, mount that directory to a persistent volume. |
| **The access transparency panel shows a session or share I don't recognize** | Click **Manage** to jump to the full panel and revoke it immediately, then change your password if it's a session you don't recognize. |
