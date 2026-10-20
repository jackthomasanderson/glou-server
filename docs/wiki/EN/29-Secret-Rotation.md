# Rotate the secrets (`JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`, `DB_PASSWORD`)

## TL;DR
All three secrets live in your `.env`. Changing **`JWT_SECRET`** logs everyone out. Changing **`CONFIG_ENCRYPTION_KEY`** makes the saved SMTP password, Gotify token and Vivino/Whiskybase keys unusable until you enter them again. Rotate it only with the procedure below, never by just editing `.env`. Changing **`DB_PASSWORD`** in `.env` alone does **nothing** on an existing instance: Postgres only reads that value the first time its data volume is initialized, so the role's actual password must be changed from inside Postgres too.

> [!WARNING]
> If your instance has been running since before this page existed, `docker-compose.yml` may have started with a hardcoded fallback database password (`glou_secret`) instead of a value you chose. That value is public (it is in Glou's git history) and must be treated as compromised. Rotate `DB_PASSWORD` now with the procedure below, even if nothing looks wrong. See [`.env.example`](../../../.env.example) for how the fallback was removed.

## Prerequisites
* Shell access to the host running `docker compose`.
* A fresh backup (Admin → System Configuration → Backups → **Run now**) and a copy of your current `.env`.

## What each secret protects

| Secret | Used for | If you change it |
|---|---|---|
| `JWT_SECRET` | Signs session tokens and the "trusted device" cookie | Every session becomes invalid: all users must sign in again, and trusted devices are asked for their 2FA code again. No data is lost. |
| `CONFIG_ENCRYPTION_KEY` (64 hex characters) | Encrypts, in the database, the **SMTP password, Gotify token, Vivino key and Whiskybase key** | The stored values can no longer be decrypted: sending emails and Gotify notifications fails (the API log shows `Unsupported state or unable to authenticate data`). Passwords and 2FA secrets are **not** affected. |
| `DB_PASSWORD` | Authenticates the API (and you, via `psql`) to the Postgres role | Nothing, until you also change the role's password inside Postgres (see below). The two must be changed together. |

Generate new values with:
```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -hex 32      # CONFIG_ENCRYPTION_KEY (exactly 64 hex characters)
openssl rand -base64 32   # DB_PASSWORD
```

## Rotate `JWT_SECRET`
1. Edit `JWT_SECRET` in `.env`.
2. Recreate the API: `docker compose up -d api`.
3. Tell your users they will have to sign in again.

## Rotate `CONFIG_ENCRYPTION_KEY`
1. Write down the SMTP password, Gotify token and API keys you currently use (Admin → System Configuration). They cannot be re-encrypted automatically.
2. Edit `CONFIG_ENCRYPTION_KEY` in `.env`.
3. Clear the values encrypted with the old key, then recreate the API:
   ```bash
   docker compose exec db psql -U glou -d glou_db -c \
     'UPDATE "SystemConfig" SET "smtpPassEnc"=NULL, "gotifyTokenEnc"=NULL, "vivinoKeyEnc"=NULL, "whiskybaseKeyEnc"=NULL;'
   docker compose up -d api
   ```
   (Use your own `DB_USER` / `DB_NAME` if you changed them.)
4. Open Admin → System Configuration and enter the SMTP password, Gotify token and keys again, then use the **test** buttons.

## Rotate `DB_PASSWORD`
1. Generate a new password (see above) and take a fresh backup.
2. Change the role's password **inside** Postgres, using the password still configured in `.env`:
   ```bash
   docker compose exec db psql -U glou -d glou_db -c \
     "ALTER ROLE glou WITH PASSWORD '<new password>';"
   ```
   (Use your own `DB_USER` if you changed it.)
3. Update `DB_PASSWORD` in `.env` to the same new value.
4. Recreate the API so it picks up the new `DATABASE_URL`: `docker compose up -d api`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The API stops at startup with a `FATAL` line naming `JWT_SECRET` or `CONFIG_ENCRYPTION_KEY` | The value is missing, still the `.env.example` placeholder, or (for the key) not 64 hex characters. Fix `.env`, then `docker compose up -d api`. |
| Emails stop after a restart and the API log shows `Unsupported state or unable to authenticate data` | `CONFIG_ENCRYPTION_KEY` is not the one the data was saved with (for instance after restoring a backup on a host with a different `.env`). Put the old key back, or follow "Rotate `CONFIG_ENCRYPTION_KEY`" step 3 and re-enter the values. |
| The API log shows `password authentication failed for user` after editing `DB_PASSWORD` | `.env` was changed but the role's password inside Postgres was not (or the other way around). The two must match. Redo "Rotate `DB_PASSWORD`" step 2, or set `DB_PASSWORD` back to the value Postgres still has. |

> [!IMPORTANT]
> Keep `.env` in a safe place **outside** the host (password manager, encrypted copy). A database backup without its `CONFIG_ENCRYPTION_KEY` cannot give you back the encrypted settings. See [Disaster recovery](./30-Disaster-Recovery.md).
