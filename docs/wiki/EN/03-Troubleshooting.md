# API and Database Resolution

**TL;DR**: Read container logs to diagnose connection drops or OCR/Vivino API rate limit rejections.

**Prerequisites**:
- Container definitions from `docker-compose.yml` (`db`, `api`, `web`).

**Action**:
1. Check backend logs for DB insertion errors: `docker logs glou-api-1`
2. Check frontend logs for SSR fetching issues: `docker logs glou-web-1`
3. Verify database health: run `docker ps` to see if the `db` container status shows `(healthy)`.

**Troubleshooting**:

| Error | Resolution |
| :--- | :--- |
| API containers are stuck constantly restarting | Connect to DB manually with `docker exec -it glou-db-1 psql -U glou -d glou_db` to verify the DB is actually accessible. |
| Data not saving or React Query fetching stale data | Verify your browser console for 500 Network Errors or check if an OCR/Third-party `jobStatus` is stuck on `processing` and failing silently. |
