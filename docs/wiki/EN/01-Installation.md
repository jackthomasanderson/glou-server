# Deploying the Glou Stack

**TL;DR**: Three commands. Docker pulls pre-built images — no compilation required.

**Prerequisites**:
- Docker installed and running (includes Docker Compose v2).

**Action**:

1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and set `JWT_SECRET` to a strong random value:
   ```bash
   openssl rand -hex 32
   ```
   Paste the output as the value of `JWT_SECRET`.

   > [!CAUTION]
   > Do not skip this step. The placeholder value in `.env.example` is not secure.

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
| `port is already allocated` | Another process uses port 3000 (web), 3001 (api), or 5432 (db). Stop the conflicting process, or change the port mapping in `docker-compose.yml`. |
| `docker compose: command not found` | Your Docker installation uses the old CLI. Replace `docker compose` with `docker-compose` (hyphen). |
| API returns 401 on all requests | `JWT_SECRET` is empty or uses the placeholder. Set a real value in `.env` and restart: `docker compose up -d`. |
| `image not found` / pull error | The GHCR packages may be private. Authenticate first: `docker login ghcr.io -u YOUR_GITHUB_USERNAME`. |
| Prisma migration error on startup | The `db` container was not ready. Run `docker compose restart api` to retry the migration. |
