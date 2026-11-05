# Share cellars with read/write access for guests

## TL;DR
Send a link to a friend so they can browse selected cellars, and optionally open or drink a bottle, update a level and note a tasting on specific cellars, without an account.

## Prerequisites
* At least one **Cellar** with bottles in it.
* Logged into your account.

> [!TIP]
> This is a link-based guest share, not a user account. There is no sign-up, no password, and no admin invitation: anyone with the link and an active token can access exactly what the link grants.

## Action

### Create a share with write access on specific cellars
1. Go to **Profile** and open the **Guest Shares** section.
2. Click **New share**, give it a label and (optionally) the guest's name.
3. Select the scope: check every **cellar** you want to include in the share.
4. For each checked cellar, turn on **Allow opening, drinking or smoking** if you want this specific guest to be able to open or drink a bottle (or smoke a cigar) there and note tastings. Leave it off for cellars you only want them to browse.
5. Optionally toggle **Hide prices** and/or **Hide notes** to hide that information from the guest.
6. Choose an expiration: 1 day, 7 days, 30 days, custom, or unlimited.
7. Click **Create** and copy the generated link to send to your guest.

> [!CAUTION]
> A cellar cannot be granted write access without also being included in the read scope: unchecking a cellar removes it from both. There is no way to edit a share after creation: revoke it and create a new one if you need to change the scope or permissions.

### What your guest can do
1. Opening the link takes them to a public page (`/guest/<token>`) with no login required.
2. A banner indicates whether the share is **Read-only** or grants **partial write access**.
3. Wines appear as cards with their stock ("5 full · 1 opened"). On cellars with write access, the guest can, **one bottle at a time**:
   * **I'm opening one**, **I'm drinking one** or, for a cigar, **I'm smoking one**: a single bottle leaves its line. With several lines, they choose **Which bottles?**. When a bottle is already opened, **I'm drinking one** asks "Is it the one you finished?" (or finishes it at once when it is the only one left). The guest does not see the cellar plan and never has to say which cell the bottle comes from: Glou takes an unplaced bottle first, otherwise the one in the slot placed most recently, and the wine's history says which cell was freed;
   * **Undo**: after each of these, the "… · Undo" message stays for 8 seconds and puts the bottle back with the others, in its slot if it is still free. After that, or if the bottle changed meanwhile, "Too late to undo": only a member can fix it;
   * set the **level** of an opened bottle;
   * **Note a tasting**, including on the bottle they just drank, even if it was the last one: the message after **I'm drinking one** offers "Note a tasting", and the page keeps offering it once the message is gone. Today's date is filled in. The tasting is attached to that bottle and signed "Name (guest)" (or "Guest" if the share names nobody), in the journal as on the wine's card.
4. A guest can **never**: change a number of bottles, move, change a price, add or delete, edit a wine's description or notes (the notes belong to the wine), **close** an opened bottle again or put a finished bottle back in the cellar. Only a member does. (This is a step back from earlier versions, where a guest could set an opened bottle back to "Full".)
5. On read-only cellars, wines are visible but not editable.

### Revoke a share
1. Go to **Profile → Guest Shares**.
2. Find the share in the list (active, expired, or already revoked) and click **Revoke**.
3. The link stops working immediately: the guest sees an expired-link message on their next request.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **My guest says the link shows "expired" or "invalid"** | The share reached its expiration date, or you revoked it. Create a new share and send the fresh link. |
| **The guest can see a cellar but can't edit anything in it** | That cellar was shared as read-only. Revoke the share and recreate it with **Allow opening, drinking or smoking** turned on for that cellar. |
| **I want to let a guest change the price or move a bottle to another cellar** | Not possible for guest shares: write access is intentionally limited to opening or drinking a bottle, its level and tastings. Give them a full account instead if they need more (see [01-Authentication.md](./01-Authentication.md)). |
| **My guest opened the wrong bottle and cannot put it back** | They have 8 seconds to **Undo**. After that a guest can no longer close a bottle: put it back yourself with **Undo the opening** (see [04-Cellar-Management.md](./04-Cellar-Management.md)). |
| **Every action my guest takes on a shared item is logged as mine** | It isn't: guest edits are recorded in the audit trail under the share's label/guest name, not under your account. |
