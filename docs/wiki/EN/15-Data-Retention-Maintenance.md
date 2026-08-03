# Configure Data Retention & Force a Maintenance Run

## TL;DR
Set how long audit logs, expired sessions, and unused guest shares/invitations are kept before Glou deletes them automatically, and trigger a cleanup immediately instead of waiting for the nightly job.

## Prerequisites
* Admin account.
* Some expired sessions, revoked guest shares, or old audit logs to see the effect (an empty instance will simply show zero deletions).

## Action

### Configure retention periods
1. Go to **Admin → System Configuration → Retention & Maintenance**.
2. Set the three fields (in days, 1–3650):
   - **Audit log retention** — default `90`.
   - **Session retention** — default `30`. Applies to expired or revoked sessions and trusted devices.
   - **Guest share / invitation retention** — default `30`. Applies to expired or revoked guest shares.
3. Click **Save**.

### Force an immediate run
1. In the same tab, click **Run now**.
2. Confirm in the dialog. This deletes everything already past its retention window right away — it does not wait for the nightly schedule.
3. The new entry appears at the top of the run history with trigger `manual`, its duration, and the counts of items removed.

### Read the run history
`GET /api/admin/maintenance/runs` backs the history list (50 entries by default, 100 max). Each entry shows:
- **Trigger**: `scheduled` (automatic) or `manual` (you clicked Run now).
- **Success or failure**, with the error message if it failed.
- **Duration** in milliseconds and what was purged (logs / sessions / guest shares).

> [!TIP]
> The automatic job runs every day at 03:00 server time (`node-cron`), and also fires once immediately whenever the server process starts — so a redeploy or container restart doesn't leave stale data sitting around for up to 24h.

> [!CAUTION]
> This tab only removes data that is **already expired or revoked** (old logs, dead sessions, dead invitations). It is not the same as the "Purge all data" action in the danger zone, which wipes all business data (cellars, bottles, tastings) after typing a confirmation keyword — the two are unrelated.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **A run shows a failure** | Open the entry to read the recorded error message. The job never crashes the server on failure — it logs `success: false` and retries at the next scheduled run. |
| **My audit logs disappeared sooner than expected** | Check **Audit log retention** — logs older than that value are permanently deleted at every run (scheduled or manual), not archived elsewhere. |
| **Run now shows "0 deleted"** | Nothing was past its retention window yet. This is expected on a fresh instance or right after a previous run. |
| **I lowered the retention value but old data is still there** | The change only takes effect at the next run (scheduled or manual). Click **Run now** to apply it immediately. |
