# Bottle board (in-memory store)

## TL;DR
Multi-category CRUD with optimistic UI, 7-day trash, and restore.
Data lives only in the Next server memory: it vanishes on restart and is not linked to cellars or users.

## Prerequisites
- Next frontend running; bottles do not rely on the API/DB.
- Understand storage is shared per server instance and non-persistent.

> [!CAUTION]
> All data is lost when the Next process restarts. This module is a demo and provides neither persistence nor per-user separation.

## Action
1. Go to the main dashboard `/dashboard`.
2. Fill the common fields: display name, category, optional location/collection, tags, estimated value, fill level, alert status, opened flag.
3. Complete category essentials (wine/sparkling/spirit/cigar) and, if needed, reveal optional details.
4. Save: the entry appears instantly; Zod validation blocks missing or inconsistent fields.
5. Edit via the Edit button to reload the form, then save.
6. Delete: the item moves to trash with automatic expiration after 7 days. Restore from the card or via the toast Undo action.

## Why is it failing?
- Data disappears after restart: expected, the store is in memory. There is no API persistence yet.
- Fields rejected: check category requirements (e.g., `producer`/`name`/`vintageOrNone` for wine) and numeric bounds (ABV, quantity).
- Trash not clearing: expiration is recalculated when listing; if nothing triggers a list, items stay visible until the next refresh.
- No cellar/user scoping: the store is global to the Next instance, with no per-account filter or cellar relation.
