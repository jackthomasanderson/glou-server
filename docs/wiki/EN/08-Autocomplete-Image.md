# Autocomplete, Image Search & Graphical Visualization

## TL;DR
When adding an item, the **Name** and **Producer** fields offer suggestions powered by Google. As soon as both fields are filled, an image is automatically searched online and saved locally — no action required. The image appears at the top of inventory cards and at the head of the detail view, Vivino-style.

## Prerequisites
- Logged into your account.
- Active internet connection for the initial search (already-stored images remain visible offline).

## Action

### 1. Product name autocomplete

1. In the add form, at Step 1, type at least **2 characters** in the **Name** field.
2. A dropdown shows up to 6 context-aware suggestions (prefixed by the selected category: wine, champagne, whisky…).
3. Click a suggestion to fill the field.
4. If the suggestion includes a vintage (e.g. `Pétrus 2015`), the **Vintage** field is auto-filled and the year is removed from the name.

> [!TIP]
> The interface language (FR/EN) determines the language of Google suggestions. Switch to French in preferences to get French suggestions.

### 2. Producer autocomplete

1. Type at least **2 characters** in the **Producer** field.
2. Suggestions are prefixed by the producer type matching the category (winery, house, distillery…).
3. Suggestions containing a year or commercial terms (price, buy, shop…) are automatically filtered out.

### 3. Automatic image

As soon as both **Name** and **Producer** are filled, Glou:
1. Silently searches for an image online (DuckDuckGo Images).
2. Downloads and stores the best result locally.
3. Displays a thumbnail in the **Photo** section of the form.

No action needed. If the image looks right, simply ignore the section — it will be saved with the item.

### 4. Replacing or refining the image

In the **Optional Fields** section of the form, the **Photo** section offers three options:

| Action | How |
|--------|-----|
| **Search** (magnifier icon) | Opens a visual picker (thumbnail grid). Refine the query and pick a different image. |
| **Paste URL** (link icon) | Paste an image URL from a merchant site, Google Images, etc. The image is downloaded and stored locally. |
| **Upload file** (camera icon) | Upload a photo from your device (JPG, PNG, WebP — max 5 MB). |

> [!NOTE]
> Regardless of the source, the image is **always stored locally** on your server. No external URL is ever kept in the database.

### 5. Visualization in the inventory

- **With image**: the bottle photo appears at the top of the card (150 px height, automatic fit).
- **Without image**: a color-coded placeholder matching the category (red for wine, blue for sparkling…) is shown instead.
- **Detail view**: the image occupies a prominent position at the head of the item sheet.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **No suggestions appear** | Check your internet connection. Suggestions go through `suggestqueries.google.com`. If the server has no outbound internet access, autocomplete silently disables itself. |
| **Vintage is not auto-extracted** | Extraction detects years in `XXXX` format (1900–2099). Shorthand formats like `'15` are not recognized. |
| **No image appears automatically** | Automatic search requires an internet connection. In offline mode, a one-time-per-session warning is shown. Manual entry remains available. |
| **The automatic image doesn't match** | Open the Optional Fields section and use the visual picker to choose another image or upload your own. |
| **Red connectivity indicator in the navbar** | The server cannot reach external services. Suggestions and image search are unavailable. Manual entry still works. |
