# Record and Browse Tasting Notes

## TL;DR
Go to `/tastings`, create a note linked to an asset in your cellar, get instant service recommendations, and browse your full history in reverse chronological order.

## Prerequisites
- Be logged in to Glou.
- Have at least one asset in your inventory to link to a note (the asset field is mandatory on creation).

## Action

### 1. Open the Tasting Journal

Click **Tastings** in the main navigation, or go directly to `/tastings`.

The page lists all your tasting notes, sorted newest-first, **20 notes per page**.

### 2. Create a tasting note

1. Click the **+** button (FAB, bottom-right) or **New tasting** if the list is empty.
2. In the **Asset** field, type a name or producer to filter your inventory via autocomplete. Select the target asset.
3. As soon as an asset is selected, the **Service Recommendations** panel appears automatically (see section 3).
4. Fill in the desired fields:

   | Field | Type | Constraint |
   | :--- | :--- | :--- |
   | Tasting date | Date | Default: today |
   | Rating (stars) | 1 to 5 | Optional |
   | Context | Dropdown | `solo`, `amis`, `restaurant`, `dégustation`, `cadeau` |
   | Free notes | Text | Max 5,000 characters |
   | Food pairing | Text | Max 500 characters |

5. Click **Save**.

> [!TIP]
> The note can be saved without filling in optional fields. Only the **Asset** field is mandatory.

### 3. Read service recommendations

When an asset is selected in the form, a **Service Recommendations** panel appears with:

- **Serving temperature** — range in °C based on the asset's category and color/type.
- **Aeration** — recommended duration in minutes (absent when not applicable, e.g. white wines, spirits).
- **Food pairings** — a list of suggestions displayed as chips.

Correspondence table applied by the system:

| Category / Subtype | Temperature | Aeration |
| :--- | :--- | :--- |
| Red wine | 16–18 °C | 30–60 min |
| White wine | 10–12 °C | 0–15 min |
| Rosé wine | 10–12 °C | — |
| Orange wine | 12–14 °C | 15–30 min |
| Sparkling (all types) | 6–9 °C | — |
| Whisky / Rum / Cognac | 18–22 °C | — |
| Gin | 4–8 °C | — |
| Vodka | 2–6 °C | — |
| Other spirit | 18–22 °C | — |
| Cigar | 20–22 °C | — |

Recommendations are computed client-side from the asset's category and subtype (`color`, `spiritType`, `sparklingType`). They are not stored in the database.

### 4. Edit an existing note

On a note card, click the **pencil** icon. The form pre-fills all fields. Modify then **Save**.

### 5. Delete a note

On the card, click the **trash** icon. A confirmation dialog appears.

> [!CAUTION]
> Deleting a tasting note is permanent. No recycle bin or restore option is available.

### 6. Navigate between pages

If you have more than 20 notes, **<** and **>** buttons appear at the bottom of the list to paginate.

> [!TIP]
> The API accepts the `itemId` query parameter (`GET /api/tastings?itemId=<uuid>`) to filter notes for a specific asset — useful for direct API integrations.

## Troubleshooting

| Error / Behavior | Resolution |
| :--- | :--- |
| **Asset does not appear in autocomplete** | Only non-archived assets (`deletedAt = null`) are listed. Check that the asset has not been deleted or archived. |
| **No service recommendations appear** | Recommendations require a recognized category (`wine`, `sparkling`, `spirit`, `cigar`). If the asset has an unsupported category, the panel stays hidden. |
| **"Save failed" error** | Verify that text fields do not exceed their limits (notes: 5,000 chars, food pairing: 500 chars). If the asset was deleted between selection and submission, the API returns `ITEM_NOT_FOUND` (404). |
| **Notes disappear after changing pages** | React Query invalidates the cache after every mutation. If the list stays empty after a reload, check your network connection. |
| **`VALIDATION_ERROR` from the API** | The `rating` field must be an integer between 1 and 5. The `tastedAt` field must be a date in `YYYY-MM-DD` format. |
