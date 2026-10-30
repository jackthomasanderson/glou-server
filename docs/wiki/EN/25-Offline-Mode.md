# Browse and edit your cellar offline

## TL;DR
Without network, the app lets you browse inventory and edit an already-loaded item (including marking a bottle opened/consumed). Changes sync automatically once you are back online, with manual conflict resolution when needed.

## Prerequisites
* You have already browsed the app online at least once on this device, so the inventory is cached locally.
* The app must be served over **HTTPS** (or `localhost` in development) for the Service Worker to activate.

## Action

1. Browse the inventory normally while online: every item you view is cached locally (IndexedDB).
2. If you lose network, the connectivity indicator at the top of the UI switches to "offline" mode. You can keep browsing what is already cached.
3. Edit a field on an existing item (edit, mark "opened"/"consumed" via the tasting flow, etc.): the change applies immediately on screen and gets a "Modified offline — pending sync" badge.
4. As soon as connectivity returns, the queued changes sync automatically, in the order they were made. Several changes to the same item (say, opened at 50 %, then finished) are sent one after the other, each on its own, without a conflict with yourself. If the server is briefly unavailable (restart, update), the changes stay pending, still shown on screen, and sending is tried again automatically a few seconds later. If the server still refuses the same change after about ten attempts (around eight minutes), it is marked "Refused by the server".
5. If a conflict occurs (the same item was changed elsewhere from another device in the meantime), a **Sync Conflict** modal opens: it shows only the fields whose value differs between your version and the server version, and you choose **Keep my version** or **Keep server version**. **Decide later** hides the conflict until you close the tab, even when you change page; the sync indicator keeps flagging it, and the **Resolve** button of the **Pending changes** panel reopens the conflict window.

6. Click the sync badge in the header to open the **Pending changes** panel. It lists every queued change with its status (waiting to be sent, syncing, conflict). A change the server refused shows the reason, with **Retry** and **Discard** buttons: fix the cause and retry, or discard the change to drop it for good.

> [!CAUTION]
> **Creating** a new bottle and **deleting/restoring** an item are **not** supported offline: these actions fail immediately without network and must be redone once connectivity is back. Only editing an item already present in inventory goes through the sync queue.

## Scope

The scope is deliberately bounded: full offline inventory reads, plus field edits on an already-loaded item, including the post-tasting stock update flow ("Opened" / "Consumed"). It does not cover creation, deletion, bulk actions, or the rest of the app (wishlist, cellar layout, imports).

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **Offline mode doesn't work at all** | Check the app is served over HTTPS (or `localhost` in dev): the Service Worker does not activate over plain HTTP. Reload once online to (re)install the Service Worker. |
| **I tried adding a bottle offline and nothing happened** | Expected: only edits to an existing item are queued offline, not creation. Reconnect to add the bottle. |
| **The conflict modal only shows one conflict at a time** | By design: conflicts are resolved one at a time; the "other conflicts pending" counter shows how many remain. |
| **Changes stay "pending" although the connection is back** | The server is not answering yet (restart, update) or waits for you to finish signing in (second factor): sending is retried automatically, further and further apart (up to one minute). Nothing to do. After about ten temporary refusals, the change is marked "Refused by the server". |
| **A change stays stuck as "Refused by the server"** | Open **Pending changes** from the sync badge, read the reason, then **Retry** once it is fixed or **Discard** the change. |
| **A change made in another tab of the same browser doesn't show up here** | Known limitation: the sync queue is not shared across browser tabs; refresh the affected tab after sync completes. |
| **The item shown after resolving a conflict looks wrong** | If you chose "Keep server version", the local cache is overwritten with the server version. Refresh if the display doesn't update immediately. |
