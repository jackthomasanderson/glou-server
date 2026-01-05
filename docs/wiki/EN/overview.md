# Getting Glou Running Locally

## TL;DR
Start Postgres (docker), then the API on 3001 and the Next frontend on 3000; the first account you register becomes admin.
Keep the frontend proxy `/api/...` pointing to the API so the `session_token` cookie is set correctly.

## Prerequisites
- Docker for Postgres (or any reachable PostgreSQL) + open ports 5432/3001/3000.
- Node 20+ and npm to run the API and the frontend.
- Consistent DB variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- (Optional) `NEXT_PUBLIC_API_URL` if the API is not exposed at `http://localhost:3001/api`.

## Action
1. Start Postgres: `docker compose up -d db` (loads `db/init` to create users/sessions/caves tables).
2. Prepare the API: in `api`, add a `.env` if needed (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `API_PORT=3001`).
3. Install dependencies: `npm install --prefix api` then `npm install --prefix web`.
4. Run the API: `npm run dev --prefix api` and check `http://localhost:3001/health`.
5. Run the frontend: `npm run dev --prefix web -- -p 3000` and, if the API is not on 3001, set `NEXT_PUBLIC_API_URL` to the API base (e.g., `http://localhost:3001/api`).
6. Open `http://localhost:3000/register` to create the first account (it receives the admin role) then sign in.

## Why is it failing?
- 401 or login loop: the `session_token` cookie is not set; ensure the frontend calls `/api/...` (proxy) or that `CORS_ORIGIN` on the API allows `http://localhost:3000`.
- DB error when starting the API: Postgres is not ready or DB vars are wrong; test with `psql` and verify `DB_HOST/DB_USER/DB_PASSWORD`.
- 404 on `/api/*`: the Next server is not running or `NEXT_PUBLIC_API_URL` points to an invalid URL.
- Missing tables when not using Docker: apply `db/init/02-auth-schema.sql`, `03-feat-03-profiles-roles.sql`, and `04-feat-24-caves.sql` manually on your database.
