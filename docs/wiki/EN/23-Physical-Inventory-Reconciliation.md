# Run a physical inventory count

## TL;DR
From **Physical Inventory**, start a session scoped to a cellar or a free-form area, say how many bottles of each line you found, then close the session to apply corrections (missing, extra, unexpected) in one click.

## Prerequisites
* At least one cellar configured to get the automatic expected-items list. A "free-form scope" also works without a cellar, but has no expected list.

## Action

1. Open **Physical Inventory** in the sidebar.
2. Choose the scope mode: **Existing cellar** (expected list computed automatically) or **Free-form scope** (free label, e.g. "Shelf A, Bin 3"; no expected list, every confirmed bottle is recorded as found).
3. Click **Start session**. The **Counting** tab opens.
4. Each group of identical bottles fits on one line with its number ("×6"): answer **How many did you find?** (prefilled with the number expected), then **Save**. A single or opened bottle is confirmed with one tap (**Confirm**). Searching (name/producer) or scanning a group's QR code takes you to its question without confirming it whole. Lines not counted yet stay "Pending".
   A bottle that isn't in Glou is recorded through **Not in the list? Log a new find**, with the **Number found**: a find of 6 bottles will make a group ×6.
5. Pause the session at any point (**Pause**). It resumes where you left off, including after reconnecting or switching devices.
6. Open the **Summary** tab, counted in bottles: **Confirmed**, **Missing** ("2 missing out of 6"), **Extra** and **Unexpected** (found on-site but recorded elsewhere, or not in Glou at all).
7. For each discrepancy, choose:
   * missing bottles: **Drunk** (they move to "Already drunk or gone" and stay in your spending), or correct the number with its reason: **Input error** (they never existed) or **Broken / given away / lost** (out of stock, still in your spending);
   * extra bottles: **Add N bottles to the group**;
   * a bottle recorded elsewhere: **Move to this scope** (disabled for a free-form scope with no cellar);
   * a find: **Add N bottles to the cellar**, in a wine already known by the same name (suggested when there is exactly one) or as a new wine.
8. Click **Close and apply (N)** to validate all selected corrections in a single batch.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **"An inventory session is already in progress"** | Only one active session is allowed per instance. Resume the existing session or close it before starting a new one. |
| **"Move to this scope" is greyed out** | This action requires a scope tied to a real cellar. A free-form scope has no target cellar to move items into. |
| **No expected list shows up** | Expected for a free-form scope: without a linked cellar, the system cannot know which bottles should be there. Anything you confirm is recorded as found. |
| **"N corrections couldn't be applied"** after closing | Those bottles changed between the summary and the closure (drunk, corrected or trashed by another member). Check them on their card. |
| **Another member sees/edits my in-progress session** | Expected: inventory is shared at the instance level, so any session is visible and actionable by every member, not just its creator. |
