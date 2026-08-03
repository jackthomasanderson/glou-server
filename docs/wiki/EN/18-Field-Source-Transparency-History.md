# See a Field's Source & Restore a Previous Value

## TL;DR
Every field on an item's detail card can show where its value came from, and every change is kept in a per-item history you can use to roll a field back to an earlier value.

## Prerequisites
* An item (bottle or cigar) with at least one edit in its history to see the restore feature in action.

## Action

### Check where a value came from
1. Open an item's detail card.
2. Fields populated from something other than manual entry (**name**, **producer**, **vintage**, **region**, **purchase price**, **notes**) show a small badge next to the value, with an icon for the source:
   - **CSV import** — filled in by the onboarding or bulk CSV import.
   - **OCR** / **Enrichment** — reserved for future automatic recognition and data-enrichment sources.
3. A field with no badge was entered manually (manual entry is the implicit default and isn't badged).

> [!TIP]
> Right now, in practice, only **CSV import** badges appear — the OCR and enrichment pipelines are represented in the data model but not yet wired to a live source. Don't be surprised if you only ever see the CSV badge or no badge at all.

### View the change history
1. On the same detail card, open the **History** section (only shown once at least one change has been recorded).
2. It lists the most recent changes (up to 10), each with who made the change, a description of what changed, and the date.

### Restore a previous value
1. In the History section, find the field you want to revert and click **Restore** next to the value you want back.

   > [!CAUTION]
   > The fill level (opened bottle level) is not restorable from here — it has its own dedicated slider control instead.

2. Confirm in the dialog that appears.
3. The field is set back to that value immediately, and the restore itself is recorded as a new history entry (tagged as a restore, not a regular edit) so the audit trail stays accurate.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **No source badge appears on a field I imported via CSV** | Badges only show on `name`, `producer`, `vintage`, `region`, `purchase price`, and `notes`. Other columns aren't tracked with a source badge. |
| **Restore fails with "value not in history"** | The value you're trying to restore isn't in the recorded history for that field anymore (e.g. it was never actually saved as a distinct change). Check the History list for the exact value that's available to restore. |
| **I can't find a Restore button for the fill level** | Correct — fill level uses its own slider on the detail card instead of the history/restore mechanism. |
| **The History section doesn't appear at all** | It's hidden until the item has at least one recorded change. A freshly added item with no edits yet won't show it. |
