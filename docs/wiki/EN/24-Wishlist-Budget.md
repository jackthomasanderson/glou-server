# Plan Purchases and Track Your Cellar Budget

## TL;DR
Add the bottles you're after with a target price cap, track budget envelopes by period, and convert a wishlist item into inventory once you've bought it.

## Prerequisites
* None — works independently of your existing inventory.

## Action

1. Open **Wishlist & Budget** in the sidebar.
2. **Wishlist** tab: click **Add a wish**, fill in name, producer, category, target quantity, and an optional price cap (you'll be notified if an observed price comes in at or below it).
3. To log an observed price (manual entry — no external price source is connected), open **Mark an observed price** on the item. If the price you enter is under the cap, an opportunity is flagged right in the dialog.
4. Once you've bought the item, click **Convert to inventory**: fill in purchase price, purchase place, target cellar, and format, then submit. The item is created in the shared inventory and the wish moves to "Acquired".
5. **Budget** tab: click **Set an envelope**, enter a period (start/end) and an amount. Spent amount is computed from your own purchases over that period, and a bar shows spent/remaining.

> [!TIP]
> Wishlist items and budgets are **personal**: each instance member manages their own list and budget tracking, unlike inventory, which stays shared across every member.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **The price cap never triggered an alert** | There's no automatic price watch (no third-party connector) — an opportunity is only detected the moment **you** manually log an observed price via "Mark an observed price". |
| **My budget shows $0 spent even though I bought bottles** | Only purchases **you** personally logged over the period count — the budget is a personal tracker, not an instance-wide aggregate. |
| **I can't edit an envelope I already created** | Editing an existing envelope isn't exposed in the UI yet (only creation and deletion are). Delete and recreate the envelope to fix an amount. |
| **A "Cancelled" wish still shows in the list** | The status exists in the system, but no UI action currently triggers it — only permanent deletion removes a wish from the list. |
