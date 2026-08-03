# Know What to Drink Next

## TL;DR
The **Consumption Plan** tab under Tastings shows a prioritized list of bottles to drink (peak window, opened, rotation) and lets you track a personal monthly goal.

## Prerequisites
* Peak maturity windows (see [06-Peak-Maturity-Alerts.md](./06-Peak-Maturity-Alerts.md)) and/or opened bottles make suggestions more relevant — the plan still works without them, just with a shorter list.

## Action

1. Go to **Tastings** (`/tastings`) → **Consumption Plan** tab.
2. Review the "Drink now / soon" list — each suggestion shows a reason: peak window, opened bottle, or stock rotation.
3. Click **Consume** to open the pre-filled tasting form, or **Postpone** to temporarily drop the suggestion (it can come back later if stock conditions haven't changed).
4. Set a monthly goal: click **Set a goal**, choose the type (bottle count or volume) and target value, then save.
5. Track your progress via the bar shown under the goal — it updates immediately after every logged consumption.

> [!TIP]
> The goal period is always the current calendar month (1st to last day) — there's no custom period picker yet.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **My goal doesn't move after a consumption** | Progress only counts finished bottles (opened, drained to 0%) that **you** personally updated this month — the goal is personal, not shared across instance members. |
| **A "volume" goal behaves like a bottle count** | Known limitation: the inventory model has no structured volume field yet, so volume is temporarily counted as a bottle count until the data model evolves. |
| **A postponed bottle reappears later** | Expected: postponing is temporary, not a permanent exclusion. Suggestions are recalculated on every stock or peak-window change. |
