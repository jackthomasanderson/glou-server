# Browse and edit your cellar offline

## TL;DR
Without network, the app lets you browse inventory, open, drink or smoke one bottle of a line, lower a number, and edit an already-loaded wine. Changes sync automatically once you are back online, with manual conflict resolution when needed.

## Prerequisites
* You have already browsed the app online at least once on this device, so the inventory is cached locally.
* The app must be served over **HTTPS** (or `localhost` in development) for the Service Worker to activate.

## Action

1. Browse the inventory normally while online: every item you view is cached locally (IndexedDB).
2. If you lose network, the connectivity indicator at the top of the UI switches to "offline" mode. You can keep browsing what is already cached.
3. Edit a field on an existing item (edit, mark "opened"/"consumed" via the tasting flow, etc.): the change applies immediately on screen and gets a "Modified offline — pending sync" badge.
   **Open, drink, smoke**: **I'm opening one**, **I'm drinking one** or **I'm smoking one** work as online and show at once with "waiting for the connection". **Correct the number** (downwards, with its reason) is queued the same way. The **Undo** message stays for 8 seconds, and the **Pending changes** panel lets you cancel an action that has not been sent yet.
   **Cellar plan**: on a line placed on the plan, **Which slot?** and **Which slots to free?** are asked offline as online, and the slot chosen is sent with the action. If the line's slots changed meanwhile on another device, the action is refused when the connection is back ("Not saved: the line changed meanwhile."); if the line was placed on the plan meanwhile: "Not saved: this line is placed in slots of the plan. Do it again from the wine's sheet to say which slot the bottle comes from." The plan itself can only be viewed: placing, moving or removing a bottle from a slot waits for the connection.
4. As soon as connectivity returns, the queued changes sync automatically, in the order they were made. Several changes to the same item (say, opened at 50 %, then finished) are sent one after the other, each on its own, without a conflict with yourself. If the server is briefly unavailable (restart, update), the changes stay pending, still shown on screen, and sending is tried again automatically a few seconds later. Only one window at a time sends the queue, even if Glou is open in several tabs. If the server still refuses the same change after about ten attempts (around eight minutes), it is marked "Refused by the server".
5. If a conflict occurs (the same item was changed elsewhere from another device in the meantime), a **Sync Conflict** modal opens: it shows only the fields whose value differs between your version and the server version (for an action on a line: "Your action" and "This line: ×6 when you acted, ×5 now"), and you choose **Keep my version** or **Keep server version**. **Decide later** hides the conflict until you close the tab, even when you change page; the sync indicator keeps flagging it, and the **Resolve** button of the **Pending changes** panel reopens the conflict window.

6. Click the sync badge in the header to open the **Pending changes** panel. It lists every queued change with its status (waiting to be sent, syncing, conflict). A change the server refused shows the reason, with **Retry** and **Discard** buttons: fix the cause and retry, or discard the change to drop it for good.

> [!CAUTION]
> **Add bottles**, **Move**, **Change the price**, **Merge** ("To check"), bulk actions, **creating** a wine and **deleting/restoring** are **not** supported offline: these actions are greyed out ("Available when the connection is back") or fail without network and must be done once connectivity is back.

## Scope

The scope is deliberately bounded: full offline inventory reads, plus opening or drinking one bottle, lowering a number, and field edits on an already-loaded wine, including the post-tasting stock update flow. It does not cover adding, moving or repricing part of a line, deletion, bulk actions, the cellar plan's own actions (placing, moving, removing from a slot), or the rest of the app (wishlist, imports).

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **Offline mode doesn't work at all** | Check the app is served over HTTPS (or `localhost` in dev): the Service Worker does not activate over plain HTTP. Reload once online to (re)install the Service Worker. |
| **I tried adding a bottle offline and nothing happened** | Expected: only edits, opening/drinking and lowering a number are queued offline, not adding. Reconnect to add the bottle. |
| **The conflict says "The connection may have dropped…"** | Your action may already be recorded (the reply got lost): the line moved exactly as your action would have moved it. In that case choose **Keep server version** so it is not counted twice. |
| **The conflict modal only shows one conflict at a time** | By design: conflicts are resolved one at a time; the "other conflicts pending" counter shows how many remain. |
| **Changes stay "pending" although the connection is back** | The server is not answering yet (restart, update) or waits for you to finish signing in (second factor): sending is retried automatically, further and further apart (up to one minute). Nothing to do. If the server still refuses the change after about ten attempts, it is marked "Refused by the server"; an expired session or an unfinished sign-in does not count: the change simply waits until you are signed in again. |
| **A change stays stuck as "Refused by the server"** | Open **Pending changes** from the sync badge, read the reason, then **Retry** once it is fixed or **Discard** the change. |
| **A change made in another tab of the same browser doesn't show up here** | Known limitation: another tab's display does not update by itself; refresh the affected tab after sync completes. |
| **The item shown after resolving a conflict looks wrong** | If you chose "Keep server version", the local cache is overwritten with the server version. Refresh if the display doesn't update immediately. |
