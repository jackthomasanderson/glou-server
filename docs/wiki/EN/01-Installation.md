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
   > Do not skip this step. `docker compose up` now refuses to start Postgres if `DB_PASSWORD` is empty or unset (no more insecure fallback), and the API refuses to accept any request in production if `JWT_SECRET` or `CONFIG_ENCRYPTION_KEY` still hold their exact `.env.example` placeholder values — it logs a `🛑 [startup] FATAL` message and exits. This check only applies when `NODE_ENV` is not `development` — local dev keeps working with a console warning so contributors aren't forced to mint secrets just to hack on the app.

3. Start the stack:
   ```bash
   docker compose up -d
   ```
   Docker pulls `glou-server-api` and `glou-server-web` from GHCR automatically.

4. Open [http://localhost:3000](http://localhost:3000) and click **Register**.
   The first account you create is automatically granted admin privileges.

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
| API logs `🛑 [startup] FATAL ... still has its .env.example placeholder value` and exits | `JWT_SECRET` or `CONFIG_ENCRYPTION_KEY` in `.env` still match the placeholder in `.env.example` exactly. Generate real values (step 2 above) and restart. |
| `image not found` / pull error | The GHCR packages may be private. Authenticate first: `docker login ghcr.io -u YOUR_GITHUB_USERNAME`. |
| Prisma migration error on startup | The `db` container was not ready. Run `docker compose restart api` to retry the migration. |
| Need a one-off `psql` shell on the database | Postgres is intentionally not exposed to the LAN/host (`expose`, not `ports`, in `docker-compose.yml`). Use `docker compose exec db psql -U glou -d glou_db` instead of opening the port. |
