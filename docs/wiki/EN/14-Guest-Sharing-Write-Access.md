# Share Cellars with Read/Write Access for Guests

## TL;DR
Send a link to a friend so they can browse selected cellars — and optionally let them log tastings and update fill levels on specific cellars, without creating them an account.

## Prerequisites
* At least one **Cellar** with bottles in it.
* Logged into your account.

> [!TIP]
> This is a link-based guest share, not a user account. There is no sign-up, no password, and no admin invitation involved — anyone with the link and an active token can access exactly what the link grants.

## Action

### Create a share with write access on specific cellars
1. Go to **Profile** and open the **Guest Shares** section.
2. Click **New share**, give it a label and (optionally) the guest's name.
3. Select the scope: check every **cellar** you want to include in the share.
4. For each checked cellar, flip the **Read-only / Read-write** switch to **Read-write** if you want this specific guest to be able to log tastings on it. Leave it on **Read-only** for cellars you only want them to browse.
5. Optionally toggle **Hide prices** and/or **Hide notes** to keep that information private from the guest.
6. Choose an expiration: 1 day, 7 days, 30 days, custom, or unlimited.
7. Click **Create** and copy the generated link to send to your guest.

> [!CAUTION]
> A cellar cannot be granted write access without also being included in the read scope — unchecking a cellar removes it from both. There is no way to edit a share after creation: revoke it and create a new one if you need to change the scope or permissions.

### What your guest can do
1. Opening the link takes them to a public page (`/guest/<token>`) with no login required.
2. A banner indicates whether the share is **Read-only** or grants **partial write access**.
3. On cellars with write access, each item shows an **Edit** button letting the guest update: opened status, fill level, and tasting notes only. They cannot change price, quantity, location, or add/delete items.
4. On read-only cellars, items are visible but not editable.

### Revoke a share
1. Go to **Profile → Guest Shares**.
2. Find the share in the list (active, expired, or already revoked) and click **Revoke**.
3. The link stops working immediately — the guest sees an expired-link message on their next request.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **My guest says the link shows "expired" or "invalid"** | The share reached its expiration date, or you revoked it. Create a new share and send the fresh link. |
| **The guest can see a cellar but can't edit anything in it** | That cellar was shared as read-only. Revoke the share and recreate it with the read-write switch enabled for that specific cellar. |
| **I want to let a guest change the price or move a bottle to another cellar** | Not possible for guest shares — write access is intentionally limited to opened status, fill level, and notes. Give them a full account instead if they need more (see [01-Authentication.md](./01-Authentication.md)). |
| **Every action my guest takes on a shared item is logged as mine** | It isn't — guest edits are recorded in the audit trail under the share's label/guest name, not under your account. |
