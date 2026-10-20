# API and Database Resolution

**TL;DR**: Read container logs to diagnose connection drops, label scan failures or rejected requests.

**Prerequisites**:
- Container definitions from `docker-compose.yml` (`db`, `api`, `web`).

**Action**:
1. Check backend logs for DB insertion errors: `docker compose logs api`
2. Check frontend logs for SSR fetching issues: `docker compose logs web`
3. Verify database health: run `docker ps` to see if the `db` container status shows `(healthy)`.

**Troubleshooting**:

| Error | Resolution |
| :--- | :--- |
| First account creation fails with "An unexpected error occurred" (or the username then reports as already taken) | Check `docker compose logs api`. If it shows `JWT_SECRET_NOT_SET`, the secret never reached the container (older versions; current ones refuse to start instead). Set `JWT_SECRET` and `CONFIG_ENCRYPTION_KEY` (see [Installation](./01-Installation.md)), restart, then register again with a different username, or delete the half-created row from the `User` table. |
| API containers are stuck constantly restarting | Connect to DB manually with `docker compose exec db psql -U glou -d glou_db` to verify the DB is actually accessible. |
| Data not saving or React Query fetching stale data | Check your browser console for 500 network errors, or whether a label scan is stuck on `processing`. Failed inventory, share, count and admin actions now show an error toast; edits made offline that the server refused are listed in the **Pending changes** panel (see [Offline Mode](./25-Offline-Mode.md)). |
