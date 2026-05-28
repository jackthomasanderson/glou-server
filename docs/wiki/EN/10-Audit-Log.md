# View the User Action Audit Log

## TL;DR
Go to `/admin`, scroll to the **Audit Log** section to see a paginated list of every action on the instance: who, what, status, IP, and timestamp. Admin accounts only.

## Prerequisites
- Be logged in with an account where `isAdmin = true`.
- Any access from a non-admin account redirects to `/`.

## Action

### 1. Open the audit log

1. Log in with an admin account.
2. Navigate to `/admin`.
3. Scroll down to the **Audit Log** section.

The section lives on the same page as user management and maintenance. There is no separate tab.

### 2. Read the table

Each row corresponds to one log entry and displays five columns:

| Column | Description |
| :--- | :--- |
| **Date** | Full timestamp (date + time) of the action, displayed in the browser's local timezone. |
| **User** | `username` of the actor. Displays `—` if the user has been deleted. |
| **Action** | Action code as a chip (e.g. `CREATE`, `DELETE`, `LOGIN`, `CELLAR_UPDATE`). |
| **Status** | `success` (green) or `danger` (red) depending on the operation result. |
| **IP** | IP address of the request, in monospace font. |

Entries are sorted newest-first. The default limit is **50 entries per page**.

### 3. Navigate between pages

When the total exceeds 50 entries, a `page X / Y (Z entries)` indicator appears at the bottom-right of the table alongside **<** and **>** buttons.

> [!TIP]
> The API accepts `page` and `limit` query parameters: `GET /api/admin/audit-logs?page=2&limit=100`. The maximum value for `limit` is **100**.

### 4. Interpret action codes

Action codes recorded by the system:

| Code | Trigger |
| :--- | :--- |
| `LOGIN` | Successful login |
| `LOGIN_2FA` | Login via two-factor authentication |
| `LOGOUT` | Logout |
| `REGISTER` | Account creation |
| `CREATE` | Asset creation (bottle, etc.) |
| `READ` | Asset read |
| `LIST` | Asset listing |
| `UPDATE` | Asset update |
| `DELETE` | Asset deletion |
| `RESTORE` | Archived asset restore |
| `CELLAR_CREATE` | Cellar creation |
| `CELLAR_READ` | Cellar read |
| `CELLAR_UPDATE` | Cellar update |
| `CELLAR_DELETE` | Cellar deletion |
| `COLLECTION_CREATE` | Collection creation |
| `COLLECTION_UPDATE` | Collection update |
| `COLLECTION_DELETE` | Collection deletion |

### 5. Retention and automatic purge

Log entries older than **90 days** are deleted automatically at API startup (via `purgeOldAuditLogs`). This value is not configurable from the UI.

> [!CAUTION]
> Audit logs are permanently deleted after 90 days. Export data manually via the API if you need long-term archiving.

## Troubleshooting

| Error / Behavior | Resolution |
| :--- | :--- |
| **The audit log section is not visible** | Only `isAdmin = true` accounts can access `/admin`. Check the account's role in the **User Management** section at the top of the same page. |
| **Redirected to `/` when accessing `/admin`** | The frontend checks `isAdmin` client-side. If the auth token has expired, the redirect occurs. Log in again and retry. |
| **The table shows a permanent loading state** | The `GET /api/admin/audit-logs` endpoint is unreachable. Verify that the API service is running and that `NEXT_PUBLIC_API_URL` points to the correct URL. |
| **"User" column shows `—`** | The user who performed the action has been deleted from the database. The log entry is kept but the join with `User` returns `null`. |
| **`INTERNAL_SERVER_ERROR` from the API** | Check the API container logs (`docker logs glou-api`). The most common cause is a lost connection to the PostgreSQL database. |
