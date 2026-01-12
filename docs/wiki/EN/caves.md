# Cellars: create, edit, delete

## TL;DR
Manage cellars from `/dashboard/caves` with name, type, optional description, and location.
Bottles are linked to cellars via the `cellar_id` column on the bottles table; the API may not expose aggregated cellar counts, but bottles are related to cellars in the schema.

## Prerequisites
- Signed in; `/api/caves` proxy must target the API (port 3001 by default).
- Postgres running (table `caves` from `db/init/04-feat-24-caves.sql`).
 - Postgres running (table `caves` from `db/init/04-feat-24-caves.sql`).
 - Note: bottles include a `cellar_id` foreign key (see `db/init/06-feat-55-bottles-persistent.sql`).
- Browser allowed to keep the `session_token` cookie.

> [!CAUTION]
> Deleting a cellar is permanent at the API level and does not reassign bottles.

## Action
1. Open `/dashboard/caves` and click “+ New Cave”.
2. Provide the name (required) and choose a type among cellar/showcase/climate_cabinet/rack/other; description and location are optional.
3. Submit: the UI caches the cave optimistically then saves through the API.
4. View a cave via the View button; adjust fields and save to send PUT `/api/caves/{id}`.
5. Delete a cave with the Delete button; the API removes it immediately (no trash).

## Why is it failing?
- 401/403: session expired or cookie missing; sign in again via `/login`.
- 400 “Invalid input”: `name` is empty or `caveType` is outside the expected enumeration.
- 404 while editing: the id no longer exists (deleted or not owned by your account).
- No bottle counts: the API does not expose cellar stats yet; this is expected with the current code.
 - No bottle counts: the API may not expose cellar stats; use `GET /api/bottles?cellarId={id}` to fetch bottles for a cellar.
