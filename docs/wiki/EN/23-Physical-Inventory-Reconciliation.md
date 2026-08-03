# Run a Physical Inventory Count Without Errors

## TL;DR
From **Physical Inventory**, start a session scoped to a cellar or a free-form area, check off each bottle you find, then close the session to apply corrections (missing, unexpected) in one click.

## Prerequisites
* At least one cellar configured to get the automatic expected-items list. A "free-form scope" also works without a cellar, but has no expected list.

## Action

1. Open **Physical Inventory** in the sidebar.
2. Choose the scope mode: **Existing cellar** (expected list computed automatically) or **Free-form scope** (free label, e.g. "Shelf A, Bin 3" — no expected list; every confirmed item is recorded as found).
3. Click **Start session**. The **Counting** tab opens.
4. For each item on the list, confirm it's present with a single tap (**Confirm**) or find it via search (name/producer). Unconfirmed items stay "Pending".
5. Pause the session at any point (**Pause**) — it resumes exactly where you left off, including after reconnecting or switching devices.
6. Open the **Summary** tab to see the three buckets: **Confirmed**, **Missing**, **Unexpected** (found on-site but recorded elsewhere or not in the inventory at all).
7. For each discrepancy, pick a corrective action: **Mark as consumed**, **Move to this scope** (disabled for a free-form scope with no cellar), or add to stock.
8. Click **Close and apply (N)** to validate all selected corrections in a single batch.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **"An inventory session is already in progress"** | Only one active session is allowed per instance. Resume the existing session or close it before starting a new one. |
| **"Move to this scope" is greyed out** | This action requires a scope tied to a real cellar — a free-form scope has no target cellar to move items into. |
| **No expected list shows up** | Expected for a free-form scope: without a linked cellar, the system can't know what items should be there. Anything you confirm is recorded as found. |
| **Another member sees/edits my in-progress session** | Expected: inventory is shared at the instance level, so any session is visible and actionable by every member, not just its creator. |
