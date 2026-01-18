# Bottle Lifecycle

## TL;DR
CRUD operations for your assets. Includes soft-delete.

## Add Bottle
1. Select a Cellar.
2. Click **+ Add Bottle**.
3. Fill mandatory fields (Name, Vintage, Type).
4. Save. (Optimistic UI updates instantly).

## Consume / Open
- Use the **Level Slider** to adjust remaining quantity (0-100%).
- 0% automatically moves item to Trash (soft delete).

## Trash & Restore
- Deleted items go to **Trash**.
- To Restore: Go to Trash > Click **Restore** icon.
- To Delete Permanently: Go to Trash > Click **Delete Forever**.

> [!NOTE]
> All changes are persisted to PostgreSQL.
