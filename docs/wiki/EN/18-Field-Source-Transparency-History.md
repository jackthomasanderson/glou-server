# See a field's source & restore a previous value

## TL;DR
Every field of a wine's description can show where its value came from. Every change is kept in the wine's history, with the movements of its bottles, and you can roll a description field back to an earlier value.

## Prerequisites
* A wine (or cigar) with at least one edit in its history to see the restore feature in action.

## Action

### Check where a value came from
1. Open the wine (its drawer).
2. Fields populated from something other than manual entry (**name**, **producer**, **vintage**, **region**, **purchase price**, **notes**) show a small badge next to the value, with an icon for the source:
   - **CSV import**: filled in by the onboarding or bulk CSV import.
   - **OCR** / **Enrichment**: reserved for future automatic recognition and data-enrichment sources.
3. A field with no badge was entered manually (manual entry is the implicit default and isn't badged).

> [!TIP]
> In practice, only **CSV import** badges appear: the OCR and enrichment pipelines exist in the data model but are not yet wired to a live source. You may only ever see the CSV badge or no badge at all.

### View the change history
1. In the same drawer, open the **History** section (only shown once at least one change has been recorded).
2. It lists the most recent changes (up to 10), each with who made the change, a description of what changed, and the date. It mixes changes to the wine's **description** and the movements of its bottles: "Bottles added", "Number corrected: 6 → 4" (with its reason), "2 bottles moved to Kitchen", "Price of 2 bottles: €20 → €25", "Wines merged", "Number checked".

### Restore a previous value
1. In the History section, find the field you want to revert and click **Restore** next to the value you want back.

   > [!CAUTION]
   > Only a value of the wine's **description** can be restored. The fill level (opened bottle level), a number of bottles, a move, a price change and a line coming from a merge ("Wines merged", or merged by the update) are not restorable: there is no **Restore** button. To go back on a number, use **Add bottles** or **Correct the number**.

2. Confirm in the dialog that appears.
3. The field is set back to that value immediately. The restore itself is recorded as a new history entry (tagged as a restore, not a regular edit) so the audit trail stays accurate.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **No source badge appears on a field I imported via CSV** | Badges only show on `name`, `producer`, `vintage`, `region`, `purchase price`, and `notes`. Other columns aren't tracked with a source badge. |
| **Restore fails with "value not in history"** | The value you are trying to restore is no longer in the recorded history for that field (e.g. it was never saved as a distinct change). Check the History list for the values available to restore. |
| **I can't find a Restore button for the fill level** | Expected: fill level uses its own slider in the line of the wine's drawer instead of the history/restore mechanism. |
| **The History section doesn't appear at all** | It is hidden until the wine has at least one recorded change. A freshly added wine with no edits does not show it. |
