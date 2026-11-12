# View the user action audit log

## TL;DR
Go to `/admin`, scroll to the **Audit Log** section to see a paginated list of the actions on the instance: who, what, status, IP, and timestamp. Admin accounts only.

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
| **User** | `username` of the actor. Displays `-` if the user has been deleted. |
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
| `CREATE` | Creation of a bottle, a wine, etc. |
| `READ` | Bottle read |
| `LIST` | Bottle listing |
| `UPDATE` | Update of a bottle or a wine |
| `DELETE` | Deletion (to trash) of a bottle or a wine |
| `RESTORE` | Restore from the trash |
| `CELLAR_CREATE` | Cellar creation |
| `CELLAR_READ` | Cellar read |
| `CELLAR_UPDATE` | Cellar update |
| `CELLAR_DELETE` | Cellar deletion |
| `COLLECTION_CREATE` | Collection creation |
| `COLLECTION_UPDATE` | Collection update |
| `COLLECTION_DELETE` | Collection deletion |

#### Security events

What changes who can get in, and how. No entry holds a password, a code or a secret.

| Code | Trigger | Entry filed under |
| :--- | :--- | :--- |
| `LOGIN_FAILED` | Sign-in refused: wrong password, wrong two-factor code, or deactivated account (`details.reason`). An unknown identifier is not recorded: what was typed is never kept. | The account targeted |
| `PASSWORD_CHANGE` | Password changed from the profile, or through a "forgot password" link (`details.via`) | The member |
| `EMAIL_CHANGE` | E-mail address changed (previous and new address in `details`) | The member |
| `TWO_FACTOR_ON` / `TWO_FACTOR_OFF` | Two-factor authentication turned on / off by the member | The member |
| `ADMIN_PASSWORD_RESET` | A member's password reset by an administrator (`details.twoFactorDisabled`: their two-factor authentication was turned off) | The administrator |
| `ADMIN_ROLE_CHANGE` | Administrator rights granted or removed | The administrator |
| `ADMIN_STATUS_CHANGE` | Member deactivated or reactivated | The administrator |
| `ADMIN_MEMBER_DELETE` | Member account deleted for good (`details.username`: who it was). Their earlier entries stay, under their name | The administrator |
| `ADMIN_DELETION_SCHEDULE` | A member's account deletion scheduled (`details.scheduled: true`) or cancelled | The administrator |
| `ADMIN_MEMBER_EXPORT` | A member's data exported | The administrator |
| `SHARE_CREATE` / `SHARE_REVOKE` | Guest link created (cellars, writable cellars, collections, expiry) / revoked | The member |

The three administration actions above ask for the administrator's password (and their code when they have two-factor authentication): a refusal is recorded with the `error` status and the reason in `details.error`.

### 5. Retention and automatic purge

Log entries older than **90 days** are deleted at API startup (via `purgeOldAuditLogs`). This value is not configurable from the UI.

> [!CAUTION]
> Audit logs are permanently deleted after 90 days. Export data manually via the API if you need long-term archiving.

## Troubleshooting

| Error / Behavior | Resolution |
| :--- | :--- |
| **The audit log section is not visible** | Only `isAdmin = true` accounts can access `/admin`. Check the account's role in the **User Management** section at the top of the same page. |
| **Redirected to `/` when accessing `/admin`** | The frontend checks `isAdmin` client-side. If the auth token has expired, the redirect occurs. Log in again and retry. |
| **The table shows a permanent loading state** | The `GET /api/admin/audit-logs` endpoint is unreachable. Verify that the API service is running and that `NEXT_PUBLIC_API_URL` points to the correct URL. |
| **"User" column shows `-`** | The user who performed the action has been deleted from the database. The log entry is kept but the join with `User` returns `null`. |
| **`503 DATABASE_UNAVAILABLE` from the API** (the app says "The server is temporarily unavailable") | The API cannot reach PostgreSQL: it is restarting, stopped or out of connections. Check the database container (`docker compose logs db`) and retry once it is back; nothing is lost. |
| **`500 UNEXPECTED_ERROR` from the API** | An unexpected server failure. The response never carries its detail: check the API container logs (`docker compose logs api`), where each failure is written once with its cause, as `[error] <method> <path> -> 500 UNEXPECTED_ERROR`. |
