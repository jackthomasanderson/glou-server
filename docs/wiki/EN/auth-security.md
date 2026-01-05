# Sign-in, 2FA, and Sessions

## TL;DR
Passwords must be 12+ characters; the first account becomes admin. TOTP 2FA is optional and managed in the Security screen.
Sessions are stored in the database; you can revoke them or mark a device as trusted.

## Prerequisites
- Frontend and API running with Postgres reachable.
- An account created via `/register` (the first user is admin by default).
- System clock in sync to generate valid TOTP codes.

> [!CAUTION]
> TOTP secrets and recovery codes are stored in the database. Protect DB access and save the recovery codes shown during setup.

## Action
1. Create an account: visit `/register`, enter username, email, and a 12+ character password, then submit.
2. Sign in: `/login` asks for username and password. If 2FA is enabled, a second step for the code appears.
3. Enable 2FA: in `/security`, click enable, scan the QR or copy the secret, save the recovery codes, then confirm with a 6-digit code.
4. Disable 2FA: still in `/security`, click disable (password is required to confirm).
5. Manage sessions: in the Sessions section, mark a device as trusted or revoke a remote session; the state refreshes via the API.
6. Logout: use the user menu and select Logout to remove the current session.

## Why is it failing?
- 2FA code rejected: check device time and the 6-digit length; try a recovery code (uppercase with dashes).
- Login loop: the `session_token` cookie is missing; ensure you go through the `/api/auth/*` proxy and that the frontend origin matches `CORS_ORIGIN`.
- Trust/revoke looks ineffective: the API ignores the device name and returns minimal feedback; reload the page to view the actual state.
- 403 on `/admin/*`: only users with the `admin` role (first user or those promoted) can access it.
