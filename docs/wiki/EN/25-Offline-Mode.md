# Browse and Edit Your Cellar Offline

## TL;DR
The app stays usable without network to browse inventory and edit an already-loaded item (including marking a bottle opened/consumed) — changes sync automatically once you're back online, with manual conflict resolution when needed.

## Prerequisites
* You've already browsed the app online at least once on this device, so the inventory gets cached locally.
* The app must be served over **HTTPS** (or `localhost` in development) for the Service Worker to activate.

## Action

1. Browse the inventory normally while online — every item you view gets cached locally (IndexedDB).
2. If you lose network, the connectivity indicator at the top of the UI switches to "offline" mode — you can keep browsing whatever's already cached.
3. Edit a field on an existing item (edit, mark "opened"/"consumed" via the tasting flow, etc.): the change applies immediately on screen and gets a "Modified offline — pending sync" badge.
4. As soon as connectivity returns, the queued changes sync automatically, in the order they were made.
5. If a conflict occurs (the same item was changed elsewhere from another device in the meantime), a **Sync Conflict** modal opens: it compares your version and the server version field by field, letting you choose **Keep my version** or **Keep server version**.

> [!CAUTION]
> **Creating** a new bottle and **deleting/restoring** an item are **not** supported offline: these actions fail immediately without network and must be redone once connectivity is back. Only editing an item already present in inventory goes through the sync queue.

## Scope

This feature intentionally covers a bounded scope: full offline inventory reads, plus field edits on an already-loaded item — including the post-tasting stock update flow ("Opened" / "Consumed"). It does not cover creation, deletion, bulk actions, or the rest of the app (wishlist, cellar layout, imports).

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **Offline mode doesn't work at all** | Check the app is served over HTTPS (or `localhost` in dev) — the Service Worker won't activate over plain HTTP. Reload once online to (re)install the Service Worker. |
| **I tried adding a bottle offline and nothing happened** | Expected: only edits to an existing item are queued offline, not creation. Reconnect to add the bottle. |
| **The conflict modal only shows one conflict at a time** | By design: conflicts resolve one at a time; the "other conflicts pending" counter shows how many remain. |
| **A change made in another tab of the same browser doesn't show up here** | Known limitation: the sync queue isn't shared across browser tabs — refresh the affected tab after sync completes. |
| **The item shown after resolving a conflict looks wrong** | If you chose "Keep server version", the local cache is overwritten with the server version — refresh if the display doesn't update immediately. |
