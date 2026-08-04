# Enable Expert Mode (Collector)

**TL;DR**: A toggle in your profile reveals advanced fields (structured tasting grid, appellation, spirit cask/batch, humidor monitoring) filtered by item category. Off by default for every account.

## Prerequisites
- Being logged into the application.
- No prior setup required: this is a personal preference, independent from cellars or other users on the instance.

## Action

1. **Open your profile**: click your avatar or go to `/profile`.
2. **Find the "Preferences" section**: card on the right, below the accent color picker.
3. **Turn on "Expert / collector mode"**: toggle the switch at the bottom of the card. It saves automatically, no page reload needed.
4. **Check the effect based on what you manage**:
   - **Wine bottle** ("Wine" category only): the add/edit bottle form shows an "Advanced tasting" section with `Appellation` and `Classification` fields.
   - **Tasting a wine** ("Wine" category only): the tasting form shows the "Structured tasting grid" section — `Appearance`, `Nose`, `Palate` (free text), `Tannin` and `Acidity` (1-5 scale), `Finish length` (in seconds).
   - **Spirits**: the add/edit form shows the "Cask & batch (collector)" section — `Lot number`, `Cask filling / batch bottling date`, `Cask type`, `Cask number`, `Cask strength (%)`, and a toggle chip `Single cask`.
   - **Cigars**: the "Humidor (cigars)" cellar type becomes selectable when creating/editing a cellar, along with its hygrometric monitoring panel — see [Manage My Wine Cellars](./04-Cellar-Management.md#humidor-hygrometry-monitoring).
5. **Turn it off if needed**: flip the switch back. Fields disappear from the forms, but any values already entered stay in the database — they reappear if you re-enable expert mode.

> [!TIP]
> Expert mode is a per-user setting, not per cellar or shared instance. Each member of a shared cellar independently chooses whether to show the advanced fields.

## Troubleshooting

| Issue | Probable Cause | Resolution |
| :--- | :--- | :--- |
| The form for a sparkling wine (Champagne, Cremant...) doesn't show the "Advanced tasting" section or the structured tasting grid, even with expert mode on | Actual code behavior: these sections only trigger for the exact "Wine" category. The "Sparkling" category is excluded as of today. | No user-side fix — this isn't a configuration bug. For a detailed tasting note on a sparkling wine, use the standard free-text tasting fields instead. |
| I turned on expert mode but see no extra field on my cigar's item sheet | Expected: cigars have no advanced fields on `InventoryItem`. Expert mode only reveals the "Humidor" cellar type and its monitoring panel, not fields on the cigar item itself. | Check the cellar's page instead (if it's a Humidor-type cellar) for the hygrometric monitoring panel. |
| I turned off expert mode — was my appellation/cask data deleted? | No — the gate is a frontend display choice only. | Re-enable expert mode: previously entered values are still there. |
| The toggle doesn't seem to save | Network error while calling the preferences update endpoint | Check your connection, refresh the page (F5), and retry. A green confirmation message should appear at the top of the page after toggling. |
| Another user on my shared cellar doesn't see the same fields as me | Expected: expert mode is individual, not shared | Each user must enable expert mode from their own profile. |
