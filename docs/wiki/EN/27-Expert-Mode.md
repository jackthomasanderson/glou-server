# Enable Expert Mode (Collector)

**TL;DR**: A toggle in your profile reveals advanced fields (structured tasting grid, appellation, cask/batch, humidor monitoring) on every item category. Off by default for every account.

## Prerequisites
- Being logged into the application.
- No prior setup required: this is a personal preference, independent from cellars or other users on the instance.

## Action

1. **Open your profile**: click your avatar or go to `/profile`.
2. **Find the "Preferences" section**: card on the right, below the accent color picker.
3. **Turn on "Expert / collector mode"**: toggle the switch at the bottom of the card. It saves automatically, no page reload needed.
4. **Check the effect, on any item category** (wine, sparkling, spirit, cigar):
   - **Any item**: the add/edit form shows an "Advanced fields (collector)" section with `Appellation`/`Classification` (e.g. AOC for a wine, a protected geographical indication for a Cognac or Scotch) and `Lot number`/`Cask filling or production date`/`Cask type`/`Cask number`/`Cask strength (%)`/`Single cask` — only fill in what's relevant to your item, the rest can stay blank.
   - **Any tasting**: the tasting form shows the "Structured tasting grid" section — `Appearance`, `Nose`, `Palate` (free text), `Tannin` and `Acidity` (1-5 scale), `Finish length` (in seconds), regardless of the tasted item's category.
   - **Cigars**: on top of the fields above, the "Humidor (cigars)" cellar type becomes selectable when creating/editing a cellar, along with its hygrometric monitoring panel — see [Manage My Wine Cellars](./04-Cellar-Management.md#humidor-hygrometry-monitoring).
5. **Turn it off if needed**: flip the switch back. Fields disappear from the forms, but any values already entered stay in the database — they reappear if you re-enable expert mode.

> [!TIP]
> Expert mode is a per-user setting, not per cellar or shared instance. Each member of a shared cellar independently chooses whether to show the advanced fields.

## Troubleshooting

| Issue | Probable Cause | Resolution |
| :--- | :--- | :--- |
| I see fields that don't seem to match my item's category (e.g. `Cask strength` on a cigar's sheet) | Expected: since expert mode was extended to every category, these fields are generic and no longer filtered by item type — leave them blank if they don't apply to what you manage. | No action needed, this isn't a bug. Ignore fields that don't apply. |
| I turned off expert mode — was my appellation/cask data deleted? | No — the gate is a frontend display choice only. | Re-enable expert mode: previously entered values are still there. |
| The toggle doesn't seem to save | Network error while calling the preferences update endpoint | Check your connection, refresh the page (F5), and retry. A green confirmation message should appear at the top of the page after toggling. |
| Another user on my shared cellar doesn't see the same fields as me | Expected: expert mode is individual, not shared | Each user must enable expert mode from their own profile. |
