# Deploying the Glou Stack

**TL;DR**: Three commands. Docker pulls pre-built images — no compilation required.

**Prerequisites**:
- Docker installed and running (includes Docker Compose v2).

**Action**:

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and set `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`, and `DB_PASSWORD` to real values — `.env.example` only ships insecure placeholders:
   ```bash
   openssl rand -base64 32   # JWT_SECRET
   openssl rand -hex 32      # CONFIG_ENCRYPTION_KEY
   openssl rand -base64 24   # DB_PASSWORD
   ```
   Paste each result as the corresponding value in `.env`.

   > [!CAUTION]
   > Do not skip this step. `docker compose up` now refuses to start Postgres if `DB_PASSWORD` is empty or unset (no more insecure fallback), and the API refuses to accept any request in production if `JWT_SECRET` or `CONFIG_ENCRYPTION_KEY` is unset, empty, still holds its exact `.env.example` placeholder value, or (for `CONFIG_ENCRYPTION_KEY`) is not 64 hexadecimal characters — it logs a `🛑 [startup] FATAL` message and exits. This check only applies when `NODE_ENV` is not `development` — local dev keeps working with a console warning so contributors aren't forced to mint secrets just to hack on the app.

3. Start the stack:
   ```bash
   docker compose up -d
   ```
   Docker pulls `glou-server-api` and `glou-server-web` from GHCR automatically. This starts the database, API and web only (~1.5 GB of RAM). For the optional label scan (~9 GB of disk, ~3 GB of RAM more), use `docker compose --profile scan up -d` instead.

4. Open [http://localhost:3000](http://localhost:3000) and click **Register**.
   The first account you create is automatically granted admin privileges.

5. *(Optional)* Configure the instance from **Administration → System Configuration**.
   None of this is required to use the app — each section stays inactive until explicitly configured. Set up later, as needed:

   | Section | Purpose |
   | :--- | :--- |
   | **SMTP / Email** | SMTP server for outgoing emails (password reset, email notifications). |
   | **Notif policy** | Instance-wide switches (in-app / email / webhook) — a channel disabled here stays unavailable in every user's personal preferences. |
   | **Webhook / Gotify** | URL and token for a [Gotify](https://gotify.net/) instance to receive notifications outside the app. |
   | **API Integrations** | Optional third-party API keys (Vivino, Whiskybase) and an external OCR service URL for label scanning. |
   | **Retention** | How long to keep expired audit logs, sessions/trusted devices, and guest shares before permanent deletion. |
   | **Backups** | Daily automated database backup (`pg_dump`), with configurable retention and run time. |
   | **Network** | The instance's canonical public URL and access mode (direct or behind a reverse proxy). |
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
| `port is already allocated` | Another process uses port 3000 (web) or 3001 (api). Stop the conflicting process, or change the port mapping in `docker-compose.yml`. (Postgres is no longer published to the host — see below — so port 5432 can't conflict this way anymore.) |
| `docker compose: command not found` | Your Docker installation uses the old CLI. Replace `docker compose` with `docker-compose` (hyphen). |
| API returns 401 on all requests | `JWT_SECRET` is empty or uses the placeholder. Set a real value in `.env` and restart: `docker compose up -d`. |
| `docker compose up` fails with `DB_PASSWORD is not set` | `DB_PASSWORD` is empty or missing in `.env`. Set a real password (`openssl rand -base64 24`) and retry — there is intentionally no insecure fallback anymore. |
| API logs `🛑 [startup] FATAL ... still has its .env.example placeholder value` or `... is not set (or empty)` or `... is malformed`, then exits | `JWT_SECRET` or `CONFIG_ENCRYPTION_KEY` is missing/empty, matches the placeholder in `.env.example`, or (`CONFIG_ENCRYPTION_KEY`) is not 64 hex characters. Generate real values (step 2 above) and restart. On a NAS UI (Synology Container Manager, Portainer...), make sure the variables are actually passed to the `api` container: an unset variable reaches it as an empty string. |
| Sign-in succeeds but you are logged out immediately (plain `http://` on a local network or NAS) | Session cookies are only marked `Secure` when `APP_URL` starts with `https://`. Set `APP_URL` in `.env` to the address you actually use (e.g. `http://192.168.1.20:3000`) and restart. If TLS is terminated by a proxy while `APP_URL` says `http`, set `COOKIE_SECURE=true`. Over plain HTTP, offline mode, app installation and the clipboard are limited by the browser; use HTTPS for the full experience. |
| `image not found` / pull error | The GHCR packages may be private. Authenticate first: `docker login ghcr.io -u YOUR_GITHUB_USERNAME`. |
| Prisma migration error on startup | The `db` container was not ready. Run `docker compose restart api` to retry the migration. |
| Need a one-off `psql` shell on the database | Postgres is intentionally not exposed to the LAN/host (`expose`, not `ports`, in `docker-compose.yml`). Use `docker compose exec db psql -U glou -d glou_db` instead of opening the port. |
