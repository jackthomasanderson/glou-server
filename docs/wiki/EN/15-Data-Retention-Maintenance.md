# Configure data retention & force a maintenance run

## TL;DR
Set how long Glou keeps audit logs, expired sessions and unused guest shares/invitations before deleting them, and run the cleanup immediately instead of waiting for the nightly job.

## Prerequisites
* Admin account.
* Some expired sessions, revoked guest shares, or old audit logs to see the effect (an empty instance shows zero deletions).

## Action

### Configure retention periods
1. Go to **Admin → System Configuration → Data**.
2. Set the three fields (in days, 1 to 3650):
   - **Audit log retention**: default `90`. Applies to the security trail (sign-ins, admin actions, failed or refused requests). The history of each wine and bottle is kept whatever this value (without the IP address), see [What the purge keeps](#what-the-purge-keeps).
   - **Session retention**: default `30`. Applies to expired or revoked sessions and trusted devices.
   - **Guest share / invitation retention**: default `30`. Applies to expired or revoked guest shares.
3. Click **Save**. A shorter delay than the saved one is confirmed with your password, plus your code if your account has two-factor authentication: it deletes data at the next cleanup, audit log entries included, so a stolen session alone cannot erase the trail. A longer delay needs no confirmation.

### Force an immediate run
1. In the same tab, click **Run now**.
2. Confirm in the dialog. This deletes everything already past its retention window right away, without waiting for the nightly schedule.
3. The new entry appears at the top of the run history with trigger `manual`, its duration, and the counts of items removed.

### Read the run history
`GET /api/admin/maintenance/runs` backs the history list (50 entries by default, 100 max). Each entry shows:
- **Trigger**: `scheduled` (automatic) or `manual` (you clicked Run now).
- **Success or failure**, with the error message if it failed.
- **Duration** in milliseconds and what was purged (logs / sessions / guest shares).

> [!TIP]
> The automatic job runs every day at 03:00 in the instance's time zone (`TZ`, see [Configuration](./02-Configuration.md)) and also once whenever the server process starts, so a redeploy or container restart does not leave stale data for up to 24h.

### What the purge keeps
The audit log also holds the history shown in a wine's drawer: who changed which field, bottles added, moved, repriced or corrected, and the values **Restore** brings back. That history is business data, not a security trace, so the purge never deletes it, whatever **Audit log retention** is set to:
- kept: every successful entry tied to a wine or a bottle (created, edited, restored, a value restored, a guest's change, bottles added, moved, repriced, a number corrected, wines merged, moved to the trash), including the per-bottle entries of bulk actions and of a closed inventory count;
- kept without the IP address: past the retention, these entries lose the IP address they were made from (a security trace). A guest's display name stays, as it is shown in the history;
- purged past the retention: sign-ins and other account events, admin actions, failed or refused requests, and the one-line summary of a bulk edit (each bottle it changed keeps its own entry).

> [!CAUTION]
> This tab only removes data that is **already expired or revoked** (old logs, dead sessions, dead invitations). It is unrelated to the **Delete all data** card at the bottom of the same tab, which wipes all business data (cellars, bottles, tastings) after typing a confirmation keyword.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **A run shows a failure** | Open the entry to read the recorded error message. The job never crashes the server on failure: it logs `success: false` and retries at the next scheduled run. |
| **My audit logs disappeared sooner than expected** | Check **Audit log retention**: logs older than that value are permanently deleted at every run (scheduled or manual), not archived elsewhere. The history of wines and bottles is not affected (see [What the purge keeps](#what-the-purge-keeps)). |
| **Run now shows "0 deleted"** | Nothing was past its retention window yet. This is expected on a fresh instance or right after a previous run. |
| **I lowered the retention value but old data is still there** | The change only takes effect at the next run (scheduled or manual). Click **Run now** to apply it immediately. |
