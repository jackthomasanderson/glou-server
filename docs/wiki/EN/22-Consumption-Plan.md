# Know what to drink next

## TL;DR
The **Consumption Plan** tab under Tastings shows a prioritized list of bottles to drink (peak window, opened, rotation) and a personal monthly goal.

## Prerequisites
* Peak maturity windows (see [06-Peak-Maturity-Alerts.md](./06-Peak-Maturity-Alerts.md)) and/or opened bottles make suggestions more relevant. The plan still works without them, with a shorter list.

## Action

1. Go to **Tastings** (`/cellar-journal`) → **Consumption Plan** tab.
2. Review the "Drink now / soon" list. Each suggestion is a **wine** (not one entry per line) and shows a reason: peak window, opened bottle, or stock rotation. When a bottle of the wine is already opened, the plan suggests **finishing it first**, before opening a new one.
3. Click **Consume** to open the pre-filled tasting form (on the opened bottle if there is one, otherwise on the line Glou preselects, as for **I'm drinking one**), or **Postpone** to temporarily drop the suggestion (it can come back later if stock conditions have not changed).
4. Set a monthly goal: click **Set a goal**, choose the type (bottle count or volume) and target value, then save.
5. The bar under the goal shows your progress and updates immediately after every logged consumption.

> [!TIP]
> The goal period is always the current calendar month (1st to last day). There is no custom period picker yet.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **My goal doesn't move after a consumption** | Progress only counts finished bottles that **you** personally drank this month. The goal is personal, not shared across instance members. |
| **A "volume" goal behaves like a bottle count** | Known limitation: the inventory model has no structured volume field yet, so volume is temporarily counted as a bottle count. |
| **A postponed bottle reappears later** | Expected: postponing is temporary, not a permanent exclusion. Suggestions are recalculated on every stock or peak-window change. |
