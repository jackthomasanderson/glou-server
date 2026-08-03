# Find the Right Bottle for a Dish

## TL;DR
From the **Pairing** tab under Tastings, type a dish to get a ranked list of bottles from your stock, with a one-click "Consume now" action.

## Prerequisites
* Bottles already in stock (wine, sparkling, spirits, or cigars).

## Action

1. Go to **Tastings** (`/tastings`) and open the **Pairing** tab.
2. Type the dish or ingredient in the search field (e.g. "beef", "salmon", "chocolate") — or use one of the quick chips (**Meat**, **Fish**, **Cheese**, **Chocolate**).
3. Matching bottles appear, sorted by pairing relevance and then by rotation priority: bottles nearing the end of their peak window or already opened rank first among equally-scored matches.
4. Click **Consume now** on the suggestion you want — the tasting form opens pre-filled with the bottle and the pairing, including the stock-level update (see [09-Tasting-Journal.md](./09-Tasting-Journal.md)).
5. From a bottle's detail view, you can also start from the item: log a tasting with the actual pairing and an optional note. Tasting history can then be filtered by dish or by bottle.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **No results for my dish** | The pairing catalog covers a predefined vocabulary (meat, fish, cheese, chocolate, etc.) in French and English. Try a more generic term or one of the quick chips. |
| **Suggestions don't deduct my stock** | "Consume now" opens the standard tasting form — the bottle is only deducted once that form is submitted, not when you click the suggestion. |
| **A relevant bottle doesn't show up** | Check its category and subtype (color for wine, type for spirits): the engine matches the detected dish variant to the bottle's exact subtype, not just its broad category. |
