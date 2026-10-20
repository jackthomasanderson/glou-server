# Deploying the Glou stack

**TL;DR**: Three commands. Docker pulls pre-built images, so nothing is compiled.

**Prerequisites**:
- Docker installed and running (includes Docker Compose v2).

**Action**:

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and set `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`, and `DB_PASSWORD` to real values (`.env.example` only ships insecure placeholders):
   ```bash
   openssl rand -base64 48   # JWT_SECRET
   openssl rand -hex 32      # CONFIG_ENCRYPTION_KEY
   openssl rand -base64 24   # DB_PASSWORD
   ```
   Paste each result as the corresponding value in `.env`.

   > [!CAUTION]
   > Do not skip this step. `docker compose up` refuses to start Postgres if `DB_PASSWORD` is empty or unset (there is no insecure fallback), and the API refuses to accept any request in production if `JWT_SECRET` or `CONFIG_ENCRYPTION_KEY` is unset, empty, still holds its exact `.env.example` placeholder value, or (for `CONFIG_ENCRYPTION_KEY`) is not 64 hexadecimal characters. It logs a `🛑 [startup] FATAL` message and exits. This check only applies when `NODE_ENV` is not `development`: local dev keeps working with a console warning.

3. Create the backups folder (Linux), then start the stack:
   ```bash
   mkdir -p backups && sudo chown 1001:1001 backups
   docker compose up -d
   ```
   The API runs as the unprivileged uid 1001 and writes its nightly backups to `./backups`. If the folder does not exist, Docker creates it owned by root and every backup fails with "Permission denied" (the API logs it at startup and **Administration → System Configuration → Backups** shows a warning). Docker Desktop on macOS/Windows does not need this step.
   Docker pulls `glou-server-api` and `glou-server-web` from GHCR automatically. This starts the database, API and web only (~1.5 GB of RAM). For the optional label scan (~9 GB of disk, ~3 GB of RAM more), use `docker compose --profile scan up -d` instead.

4. Open [http://localhost:3000](http://localhost:3000) and click **Register**.
   The first account you create is automatically granted admin privileges. **Registration is then closed**: other people can only sign up once an admin turns on **Allow new accounts to register** in **Administration → System Configuration → Network**.

5. *(Optional)* Configure the instance from **Administration → System Configuration**.
   None of this is required to use the app: each section stays inactive until configured. Set up later, as needed:

   | Section | Purpose |
   | :--- | :--- |
   | **SMTP / Email** | SMTP server for outgoing emails (password reset, email notifications). |
   | **Notif policy** | Instance-wide switches (in-app / email / webhook). A channel disabled here stays unavailable in every user's personal preferences. |
   | **Webhook / Gotify** | URL and token for a [Gotify](https://gotify.net/) instance to receive notifications outside the app. |
   | **API Integrations** | Optional third-party API keys (Vivino, Whiskybase) and an external OCR service URL. Stored, but **not used by any feature yet**: label scanning uses the built-in Ollama service. |
   | **Retention** | How long to keep expired audit logs, sessions/trusted devices, and guest shares before permanent deletion. |
   | **Backups** | Daily automated database backup (`pg_dump`), with configurable retention and run time. |
   | **Network** | The instance's canonical public URL, access mode (direct or behind a reverse proxy), and whether new accounts may register. |
   | **History** | Change log for this configuration (who, when, which section). |

   > [!NOTE]
   > This panel is admin-only (`/admin`, access denied otherwise).

**Updating to a new version**:
```bash
docker compose pull && docker compose up -d
```

**Troubleshooting**:

| Error | Resolution |
| :--- | :--- |
| `port is already allocated` | Another process uses port 3000 (web) or 3001 (api). Stop the conflicting process, or change the port mapping in `docker-compose.yml`. (Postgres is not published to the host, see below, so port 5432 cannot conflict this way.) |
| `docker compose: command not found` | Your Docker installation uses the old CLI. Replace `docker compose` with `docker-compose` (hyphen). |
| API returns 401 on all requests | `JWT_SECRET` is empty or uses the placeholder. Set a real value in `.env` and restart: `docker compose up -d`. |
| `docker compose up` fails with `DB_PASSWORD is not set` | `DB_PASSWORD` is empty or missing in `.env`. Set a real password (`openssl rand -base64 24`) and retry. There is intentionally no insecure fallback. |
| API logs `🛑 [startup] FATAL ... still has its .env.example placeholder value` or `... is not set (or empty)` or `... is malformed`, then exits | `JWT_SECRET` or `CONFIG_ENCRYPTION_KEY` is missing or empty, matches the placeholder in `.env.example`, or (`CONFIG_ENCRYPTION_KEY`) is not 64 hex characters. Generate real values (step 2 above) and restart. On a NAS UI (Synology Container Manager, Portainer...), make sure the variables are actually passed to the `api` container: an unset variable reaches it as an empty string. |
| Sign-in succeeds but you are logged out immediately (plain `http://` on a local network or NAS) | Session cookies are only marked `Secure` when `APP_URL` starts with `https://`. Set `APP_URL` in `.env` to the address you actually use (e.g. `http://192.168.1.20:3000`) and restart. If TLS is terminated by a proxy while `APP_URL` says `http`, set `COOKIE_SECURE=true`. Over plain HTTP, offline mode, app installation and the clipboard are limited by the browser; use HTTPS to remove these limits. |
| `permission denied` on `/app/backups`, `/app/uploads` or `/app/logs`, or the API restarts in a loop, after replacing a named volume with a host folder | The API container always runs as user `1001:1001` (`PUID`/`PGID` from the linuxserver.io convention are **not** supported). Give that user the folder: `sudo chown -R 1001:1001 <folder>`. On Synology, do it from SSH, or set the folder's permissions for a user with UID 1001. |
| `image not found` / pull error | The GHCR packages may be private. Authenticate first: `docker login ghcr.io -u YOUR_GITHUB_USERNAME`. |
| Prisma migration error on startup | The `db` container was not ready. Run `docker compose restart api` to retry the migration. |
| Sign-up or sign-in fails with "unexpected error" (or "this address is not allowed") when you open Glou by IP, e.g. `http://192.168.1.20:3000`, and nothing shows in the logs of `api` or `web` | The API refuses state-changing requests from an unknown address. Set `APP_URL` in `.env` to the exact address you type in the browser (e.g. `http://192.168.1.20:3000`), then recreate the `api` container. Several addresses: list them in `CSRF_TRUSTED_ORIGINS`, comma-separated. The `api` log then shows a `[csrf] Rejected ...` line when this happens. |
| "New account registration is currently closed on this instance", or no **Sign up** link on the login page | Expected after the first account exists. An admin opens registration in **Administration → System Configuration → Network → Allow new accounts to register** and can turn it off again once the person has signed up. |
| Need a one-off `psql` shell on the database | Postgres is intentionally not exposed to the LAN/host (`expose`, not `ports`, in `docker-compose.yml`). Use `docker compose exec db psql -U glou -d glou_db` instead of opening the port. |
