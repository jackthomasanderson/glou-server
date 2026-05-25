# Autocomplete and Image Search When Adding a Bottle

## TL;DR
When adding a bottle, the **Name** and **Producer** fields offer suggestions powered by Google. If a vintage year is detected in a suggestion, it is automatically extracted to the Vintage field. An image search lets you attach a photo from Wikimedia Commons.

## Prerequisites
- Logged into your account.
- Active internet connection (suggestions and images come from external services).

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

### 3. Image search (Wikimedia Commons)

1. In the add or edit form, click the **Search image** icon next to the image field.
2. A dialog opens with a search field pre-filled with the bottle name.
3. Results display up to 8 thumbnails from Wikimedia Commons.
4. Click an image to select it. It is attached to the bottle record.

> [!CAUTION]
> Images come from Wikimedia Commons (public domain / free license). Verify the image license if you plan to reuse content outside of Glou.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **No suggestions appear** | Check your internet connection. Suggestions go through `suggestqueries.google.com`. If the server has no outbound internet access, autocomplete silently disables itself. |
| **Vintage is not auto-extracted** | Extraction detects years in `XXXX` format (1900–2099). Shorthand formats like `'15` are not recognized. |
| **No images found** | The name doesn't match any file on Wikimedia Commons. Try a broader term (e.g. `Bordeaux red wine` instead of the exact château name). |
| **Image search icon is missing** | It is only available in Step 2 of the form. Complete Step 1 and proceed to the next step. |
| **Red connectivity indicator in the navbar** | The server cannot reach external services. Suggestions and image search are unavailable. Manual entry still works. |
