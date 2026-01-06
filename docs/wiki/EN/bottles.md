# Bottle board (in-memory store)

## TL;DR
Multi-category CRUD with optimistic UI, soft-delete, and restore.
**Data persists in PostgreSQL** and survives restarts. Each bottle is linked to a cellar and isolated per user.

## Prerequisites
- Next frontend running; bottles do not rely on the API/DB.
- Understand storage is shared per server instance and non-persistent.

> [!CAUTION]
> [!NOTE]
> **FEAT-55 Update**: Bottles are now fully persisted in PostgreSQL with multi-tenancy (user_id filtering) and cellar relationships. Restarting the application does not lose any data.

## Action
1. Go to the main dashboard `/dashboard`.
2. Fill the common fields: display name, category, optional location/collection, tags, estimated value, fill level, alert status, opened flag.
3. Complete category essentials (wine/sparkling/spirit/cigar) and, if needed, reveal optional details.
4. Save: the entry appears instantly; Zod validation blocks missing or inconsistent fields.
5. Edit via the Edit button to reload the form, then save.
6. Delete: the item moves to trash with automatic expiration after 7 days. Restore from the card or via the toast Undo action.

## Why is it failing?
- ~~Data disappears after restart~~: **FIXED in FEAT-55** — All bottles persist in PostgreSQL.
- Missing cellarId: Ensure a cellar exists before creating bottles (auto-selected if only one cellar).
- Fields rejected: check category requirements (e.g., `producer`/`name`/`vintageOrNone` for wine) and numeric bounds (ABV, quantity).
- Trash not clearing: expiration is recalculated when listing; if nothing triggers a list, items stay visible until the next refresh.
- No cellar/user scoping: the store is global to the Next instance, with no per-account filter or cellar relation.
