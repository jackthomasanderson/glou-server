# Record and browse tasting notes

## TL;DR
Go to `/cellar-journal`, create a note linked to a wine (and, if you want, to a bottle of your cellar), see service recommendations, and browse your history, newest first.

## Prerequisites
- Be logged in to Glou.
- A wine to taste: a wine from your list (even if no bottle is left), or a wine tasted elsewhere that you enter by name.

## Action

### 1. Open the tasting journal

Click **Tastings** in the main navigation (on a phone, in the **More** menu), or go directly to `/cellar-journal`.

The page lists all your tasting notes, sorted newest-first, **20 notes per page**.

### 2. Create a tasting note

1. Click the **+** button (FAB, bottom-right) or **New tasting** if the list is empty.
2. In the **Wine tasted** field, type a name or producer to filter your wines via autocomplete, then select the wine. A wine with no bottle left is offered too.
   * **On a bottle from your cellar?** answer **Yes** (then **Which bottle?** if there are several lines; the opened bottle is preselected, otherwise the only line) or **No, tasted elsewhere** (at a friend's, in a restaurant: the tasting touches no stock).
   * **This wine is not in the list**: enter its category, producer, name and vintage. If Glou already knows that wine, the tasting goes on it; otherwise Glou creates it **without any bottle** (it shows under the **No longer in the cellar** filter). There is no "0 bottle" add: this is the only way.
3. As soon as a wine is selected, the **Service Recommendations** panel appears (see section 3).
4. Fill in the desired fields:

   | Field | Type | Constraint |
   | :--- | :--- | :--- |
   | Tasting date | Date | Default: today |
   | Rating (stars) | 1 to 5 | Optional |
   | Context | Dropdown | `solo`, `amis`, `restaurant`, `dégustation`, `cadeau` |
   | Free notes | Text | Max 5,000 characters |
   | Food pairing | Text | Max 500 characters |

5. Click **Save**.
   On a bottle from your cellar, Glou then asks **Update stock?** (**Bottle opened**, **Bottle drunk (empty)** or **Do not update stock**). If the line holds several bottles, some of them placed on the cellar plan, it also asks **Which cell?**, with **Unplaced** preselected while one is left (see [04-Cellar-Management.md](./04-Cellar-Management.md)). The tasting is saved either way.

> [!TIP]
> Only the **Wine tasted** field is mandatory.

### 3. Read service recommendations

When a wine is selected in the form, a **Service Recommendations** panel appears with:

- **Serving temperature**: range in °C based on the wine's category and color/type.
- **Aeration**: recommended duration in minutes (absent when not applicable, e.g. white wines, spirits).
- **Food pairings**: a list of suggestions displayed as chips.

Values applied by the system:

| Category / Subtype | Temperature | Aeration |
| :--- | :--- | :--- |
| Red wine | 16-18 °C | 30-60 min |
| White wine | 10-12 °C | 0-15 min |
| Rosé wine | 10-12 °C | - |
| Orange wine | 12-14 °C | 15-30 min |
| Sparkling (all types) | 6-9 °C | - |
| Whisky / Rum / Cognac | 18-22 °C | - |
| Gin | 4-8 °C | - |
| Vodka | 2-6 °C | - |
| Other spirit | 18-22 °C | - |
| Cigar | 20-22 °C | - |

Recommendations are computed client-side from the wine's category and subtype (`color`, `spiritType`, `sparklingType`). They are not stored in the database.

### Where to find a wine's tastings
All the tastings of a wine show on its card (drawer), whichever bottle they were noted on, including those "Tasted elsewhere". If you open then put back a bottle on which a tasting was noted, Glou asks whether you keep it (it then stays on the wine). A tasting noted by a guest carries "Name (guest)".

### 4. Edit an existing note

On a note card, click the **pencil** icon. The form pre-fills all fields. Modify then **Save**.

### 5. Delete a note

On the card, click the **trash** icon. A confirmation dialog appears.

> [!CAUTION]
> Deleting a tasting note is permanent. No recycle bin or restore option is available.

### 6. Navigate between pages

If you have more than 20 notes, **<** and **>** buttons appear at the bottom of the list to paginate.

> [!TIP]
> The API accepts the `itemId` query parameter (`GET /api/tastings?itemId=<uuid>`) to filter notes for a specific bottle; `productId` filters those of a wine.

## Troubleshooting

| Error / Behavior | Resolution |
| :--- | :--- |
| **The wine does not appear in autocomplete** | A wine in the trash is not listed: restore it, or enter it by name (**This wine is not in the list**), which creates a new wine that is then suggested in "Merge?" if it looks like the old one. |
| **No service recommendations appear** | Recommendations require a recognized category (`wine`, `sparkling`, `spirit`, `cigar`). If the wine has an unsupported category, the panel stays hidden. |
| **"Save failed" error** | Verify that text fields do not exceed their limits (notes: 5,000 chars, food pairing: 500 chars). If the bottle was deleted between selection and submission, the API returns `ITEM_NOT_FOUND` (404). |
| **Notes disappear after changing pages** | React Query invalidates the cache after every mutation. If the list stays empty after a reload, check your network connection. |
| **`VALIDATION_ERROR` from the API** | The `rating` field must be an integer between 1 and 5. The `tastedAt` field must be a date in `YYYY-MM-DD` format. |
