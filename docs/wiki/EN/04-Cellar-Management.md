# Manage my cellars, wines and bottles

**TL;DR**: Organize your bottles by storage zone (aging, service, display).

## Prerequisites
- An active user account.
- Being logged into the application.

## Management steps

1. **Access the Cellars tab**: Click on "Wine Cellars" (or "Caves") in the top navigation bar.
2. **Create a Cellar**:
   - Click the "Add cellar" button.
   - Enter a name (e.g., "Main Cellar").
   - Select the type (Aging, Wine Cooler, or Shelf).
   - Validate with "Add".
3. **Assign Bottles**:
   - Open **Wines**, **Sparkling** or **Spirits** in the navigation.
   - Add or edit a bottle.
   - Select the target cellar from the "Wine Cellars" dropdown menu.
4. **Edit or delete**: Use the pencil icon (edit) or trash icon (delete) on each cellar card.

### The cellar plan: one slot per bottle
A cellar whose plan is configured (columns × rows) shows a grid. Each bottle has **its own slot** there: a line of 6 identical bottles can take 6 slots, and a box of cigars takes one slot. Only a group of **single cigars** fits in **one** slot for all its cigars, with a "×4" badge. The counter ("6 / 9 occupied") counts slots.
- **Place a bottle**: touch an empty slot. **Assign a bottle to slot C2·R3** lists the lines that still have unplaced bottles, with their count ("2 placed, 4 unplaced"). A line whose bottles all have their slot already is refused with the reason: "All 6 bottles of this line are already placed."
- **Touching an occupied slot** opens the wine on its line, with the slot at the top of the drawer ("Slot C2·R3") and **Remove from slot**. **I'm opening one** or **I'm drinking one** from there takes the bottle of **that** slot, with no other question: opened, it keeps its slot; drunk, it frees it. If the slot touched holds the opened bottle, **Finish the opened one** comes first.
- **Move**: drag a bottle onto an empty slot; onto an occupied slot, the two bottles swap slots.
- **Keyboard**: focus a slot and press `Enter` to open the wine (or, on an empty slot, to assign one), or `Space` to pick the bottle up. Move with the arrow keys, one slot at a time, then press `Space` again to drop it. `Escape` cancels. Each step is announced to screen readers.
- Offline, the plan can only be viewed: placing, moving or removing a bottle waits for the connection.

## A wine, its lines and its bottles

**TL;DR**: One wine = one card in the list, whatever the number of bottles. Its identical bottles (same cellar, price, bottle size and purchase date, all intact) make a **line** "×4". Open the card to act on a line or on a single bottle.

### Reading the list and the counters
- The card shows the stock: "5 full · 1 opened (60 %)". For cigars: "3 closed boxes · 1 opened · 4 single".
- Figures count **bottles** (or **cigars**), not records: "142 bottles · 58 wines" on Wines, "23 bottles · 17 spirits" on Spirits, "34 bottles · 12 cuvées" on Sparkling, "89 cigars · 12 references" on Cigars, "165 bottles · 89 cigars" on the home page. Value and spending follow: the price and estimated value are those of **one** bottle, multiplied by the number.
- Filtered by cellar, the card reads "2 here · 9 in all".
- A wine with no bottle left (all drunk, or tasted elsewhere) is **hidden** from the list. The **No longer in the cellar** filter shows it ("No bottle left"; "No cigar left") and the search always finds it. **Add bottles** puts it back in the cellar. It keeps its tastings and history.
- In the drawer, a line with bottles placed on the plan says where: "4 placed, 2 unplaced · C1·R1, C1·R2, …" (for single cigars: "Placed in C1·R1"). Nothing shows for a line without a slot.

### I'm opening one, I'm drinking one, I'm smoking one
In the wine's drawer, **I'm opening one** (the main button; **I'm smoking one** for a cigar) and **I'm drinking one** (a secondary button) act on **one** bottle only: it detaches from its line (×4 becomes ×3) and becomes a bottle of its own, opened or drunk. A drunk bottle stays in your history and spending. For a line of a single bottle, that bottle changes state.
- If several lines could serve, Glou asks **Which bottles?** with a choice already selected: the cellar you were looking at, otherwise the oldest purchase; on a tie (or no date), the cheapest, then the largest line.
- If the line has bottles placed on the plan, Glou asks **Which slot?**: the line's slots, plus **Unplaced** while one is left, preselected in that case (otherwise nothing is preselected: touch the bottle's slot). An opened bottle keeps its slot, a drunk bottle frees its own. The question is not asked for a line of a single bottle nor for single cigars (their slot stays with the group until the last one).
- A message **"1 bottle opened · Undo"** stays for 8 seconds: **Undo** puts the bottle back with the others, in its slot if it is still free.
- Actions done without the plan in front of you (bulk **Mark as drunk**, stock count, guest) do not ask: Glou takes an unplaced bottle first, otherwise the one in the slot placed most recently, and the history says which slot was freed ("Slot C2·R3 freed").
- If a bottle of this wine is already opened, Glou reminds you: "A bottle is already opened (60 %)": **Finish the opened one** or **Open a new one**. When marking a bottle as drunk: "Is it the one you finished?" (Yes: the opened one is marked drunk; No: a full bottle is). The [consumption plan](./22-Consumption-Plan.md) suggests finishing the opened one first.
- Cigars: smoking the first cigar of a closed box opens it ("opened box, 24 left"). With an opened box and closed boxes, Glou asks "From the opened box or open a new one?". A smoked single cigar stays in your history like a drunk bottle.

### Putting an opened bottle back
In the menu of an opened bottle, **Undo the opening** (or setting its level back to "Full") puts it back with the others: it rejoins its original line (×5 becomes ×6) if it is identical to it, otherwise it makes a line ×1. If a tasting had been noted on that bottle, Glou first asks whether to keep it (it then stays on the wine) or not. After **Don't keep it**, the "Undo" message reopens the bottle but does not bring the erased tasting back.

### Actions on a line
A line's menu offers:
- **Move**: "How many to move?" then the cellar. The line splits (Garage ×4, Kitchen ×2); a line that becomes identical to another one joins it, slots included. The bottles moved arrive unplaced in the new cellar.
- **Change the price**: "For how many bottles?". Repricing only part of a line splits it. The bottles that change price are taken from the unplaced ones first; when that is not enough, Glou asks **Which slots take the new price?**: those slots stay occupied and follow the new line.
- **Correct the number** (downwards, with its reason) and **Edit** (purchase date, place, free note…): see [05-Bottle-Addition.md](./05-Bottle-Addition.md).
- **Move to trash**: the line can be restored from the trash.
- When a correction, a write-off or a move leaves the line fewer bottles than it has slots, Glou asks **Which slots to free?** on a small plan of the cellar: touch exactly the number of slots asked. Unplaced bottles leave first, without a question.

The wine's description (name, region, grapes, notes…) is edited **once for all its bottles** from the drawer's edit button.

### Bulk actions on wines
Select wines, then **Move**, **Mark as drunk** or **Move to trash**: the action applies to **every bottle in the cellar** of those wines, after a summary ("3 wines, 14 bottles"). For part of a wine, open it. **Mark as drunk** asks how many for each wine with several bottles (1 by default; starting with the opened one). Bulk-action templates that changed a state (opened, level, opening date) were deleted by the update. Bulk actions are unavailable offline.

### The trash
Trashing a line, bottles (bulk action) or a whole wine is **restorable** from the **Trash** tab until the end of the displayed delay ("N days left before permanent deletion"). At purge time:
* if it is the **bottles** of a wine that go, the wine stays "No longer in the cellar" **only if it has tastings**; otherwise it disappears too;
* if it is the **wine itself** you moved to the trash, it is erased for good, **tastings included** (the confirmation window says so).
Correcting a number with the reason "Input error" sends nothing to the trash: the bottles simply disappear (see [05-Bottle-Addition.md](./05-Bottle-Addition.md)).

## Humidor hygrometry monitoring

**TL;DR**: For a "Humidor"-type cellar, manually log your humidity readings to track history and get alerted when the latest measurement drifts outside your target range.

### Prerequisites
- [Expert Mode](./27-Expert-Mode.md) enabled on your profile. The "Humidor" cellar type and its monitoring panel are only visible when it is on.

### Action

1. **Create or edit a cellar as type "Humidor (cigars)"**: in the cellar form, select this type (only visible in expert mode).
2. **Set the target hygrometry range** (optional but recommended): fill in `Min. humidity (%)` and `Max. humidity (%)` (e.g. 68-72%). Without this range, no drift can be detected (status "Not configured").
3. **Open the cellar's page**: the "Hygrometric monitoring" panel appears below the cellar's details.
4. **Add a reading**: at the bottom of the panel, enter the measured `Humidity (%)` (required) and, optionally, `Temperature (°C)` (informational only, not used in the drift calculation). Click the add button.
5. **Read the status**: a badge shows `In range`, `Out of range`, or `Not configured`, computed solely from **your latest reading** (no drift history, no averaging).
6. **Check the history**: recent readings (up to 100, 30 by default) are listed and plotted on a small chart, oldest to newest.

> [!TIP]
> If the latest reading falls outside the target range, a notification is sent under the "Temperature/humidity variations" category (configurable in Profile > Notifications), in addition to the "Out of range" badge on the panel.

> [!CAUTION]
> **No physical sensor is supported.** There is currently no MQTT integration, webhook, or connected probe: every reading must be entered manually, one at a time, by a user. A reading's technical `source` field can be `manual` (every reading created from the UI today) or `sensor` (reserved for a future hardware bridge, not built). Automatic readings from a humidor probe do not exist in the application.

## Troubleshooting

| Issue | Probable cause | Resolution |
| :--- | :--- | :--- |
| My cellar does not appear in the bottle list | Session sync | Refresh the page (F5). |
| I cannot delete a cellar | Connection error | Verify you are still logged in. Deleting a cellar does not delete bottles (they become "orphans"). |
| Impossible to save name | Validation | Name must be between 1 and 200 characters. |
| The "Humidor" type does not appear in the cellar type list | Expert Mode is off | Enable [Expert Mode](./27-Expert-Mode.md) from your profile. |
| The hygrometric monitoring panel does not show on my Humidor cellar's page | Expert Mode is off, or the cellar is not (or no longer) of type Humidor | Check the cellar's type and that expert mode is enabled. |
| The status shows "Not configured" even though I recorded readings | No target range set on the cellar | Edit the cellar and fill in `Min. humidity` and `Max. humidity`. |
| My reading is rejected (`VALIDATION_ERROR` error) | Humidity outside 0-100%, or temperature outside -20°C to 60°C | Correct the entered value; these are the only bounds accepted by the API. |
| I'm waiting for a connected probe to send readings automatically, nothing happens | No physical sensor/MQTT support exists in the application | Enter readings manually. See the notice above. |

> [!TIP]
> Explicit cellar names (e.g., "Cooler - Bottom Shelf") make bottles easier to find on mobile.
