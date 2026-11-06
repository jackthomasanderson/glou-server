# Lost phone with two-factor authentication on

## TL;DR
Sign in with one of your **backup codes**, then turn two-factor authentication (2FA) back on with your new phone. No backup code left? Ask an administrator to **reset your password**: it also turns your 2FA off. If you are the only administrator and you are the one locked out, run the database command at the bottom of this page on the machine that runs Glou.

## Prerequisites
* Your account password (or an administrator, see below).
* For the last case only: shell access to the machine that runs `docker compose`.

## Prevent it: keep your backup codes
When you turn 2FA on, Glou shows **10 backup codes**, once. Each one works a single time in place of the 6-digit code.
1. Click **Copy the codes** and paste them in a password manager, or write them down and keep them somewhere safe.
2. Tick **I've saved my codes**: the window cannot be closed before.
3. **Profile → Security & Authentication** shows how many codes are left ("7 backup codes left"). When few are left, click **Generate new codes**, enter your password and a code from your app (or a backup code): you get 10 new codes, and the previous ones stop working at once.

## Lost phone, backup codes at hand
1. On the sign-in page, enter your username and password.
2. At the **Authentication code** step, click **Use a backup code** and type one of your codes.
3. In **Profile → Active Sessions**, click **Sign out** on the lost phone's session (see [Sessions](./11-Sessions-Trusted-Devices.md)): whoever finds it must not stay signed in.
4. Go to **Profile → Security & Authentication**, click **Disable** (password + another backup code), then **Enable** and scan the new QR code with your new phone. You get 10 new backup codes.
   If you just signed in with your last code, nothing is left to confirm this step: ask an administrator (next section).

## Lost phone, no backup code: ask an administrator
1. The administrator opens **Administration → Member Management** and clicks **Reset password** (key icon) on your line. The confirmation says that your 2FA will be turned off, and asks for **the administrator's own password**, plus a code from their own app if their account has 2FA: an open admin session alone is not enough to get past someone else's second factor.
2. They give you the temporary password shown once, through a channel you trust (in person, by phone).
3. Sign in with it: no code is asked. Choose a new password, then turn 2FA back on from your profile.

The reset also signs out all your sessions and trusted devices, and is recorded in the audit log (a refused confirmation too). An administrator resetting **their own** password keeps their 2FA: an open session alone must not be enough to remove it.

## Only administrator, locked out: database command
Nobody can reset your account from the app, so turn your 2FA off directly in the database. On the machine that runs Glou, in the folder of your `docker-compose.yml`:

1. Take a backup first if you can (**Administration → System Configuration → Backups**, from another admin session; otherwise see [Disaster Recovery](./30-Disaster-Recovery.md)).
2. List the accounts, to find your exact username:
   ```bash
   docker compose exec db psql -U glou -d glou_db -c \
     'SELECT username, email, "isAdmin", "isTwoFactorEnabled" FROM "User" ORDER BY "createdAt";'
   ```
3. Turn 2FA off for that username (replace `alice`, keep the single quotes around it):
   ```bash
   docker compose exec -T db psql -U glou -d glou_db -v ON_ERROR_STOP=1 <<'SQL'
   UPDATE "User"
      SET "isTwoFactorEnabled" = false,
          "twoFactorSecret" = NULL,
          "backupCodes" = '{}',
          "twoFactorFailedAttempts" = 0,
          "twoFactorLockedUntil" = NULL
    WHERE username = 'alice';
   UPDATE "trusted_devices" SET "revokedAt" = now()
    WHERE "userId" = (SELECT id FROM "User" WHERE username = 'alice') AND "revokedAt" IS NULL;
   UPDATE "sessions" SET "revokedAt" = now()
    WHERE "userId" = (SELECT id FROM "User" WHERE username = 'alice') AND "revokedAt" IS NULL;
   SQL
   ```
   psql answers `UPDATE 1` for the first statement (the next two count the trusted devices and sessions signed out, including the lost phone's). `UPDATE 0` first means the username is wrong: nothing was changed.
4. Sign in with your password (no code is asked), then turn 2FA back on from your profile and save the new backup codes.

(Use your own `DB_USER` / `DB_NAME` if you changed them in `.env`.) This removes the second factor only: your password is unchanged, and if you forgot it too, use **Forgot password?** on the sign-in page (needs e-mail configured on the instance).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Incorrect verification code" with a backup code | Each code works once; it may already have been used. Check the count in your profile, try another one. |
| "Too many incorrect codes. Verification is locked for 15 minutes." | Too many wrong codes in a row: wait 15 minutes, then try again with a backup code. |
| After the admin reset, the code is still asked | The administrator reset their own account (their 2FA is kept), or the member's Glou is older than this page: update Glou, or use the database command above. |
| "Incorrect current password" in the administrator's reset window | It asks for the administrator's **own** password (and code), not the member's. |
| `psql: error: ... role "glou" does not exist` | You changed `DB_USER` in `.env`: use that value after `-U`, and your `DB_NAME` after `-d`. |
