# Explore Your Collection on the World Map

## TL;DR
The Analytics dashboard includes an interactive world map of your collection by region — filter it by category, switch to a heatmap by type, narrow it down with price/vintage/rating/state filters, and click any item in the list to open its detail card.

## Prerequisites
* Items with a country/region set — items without one won't appear on the map.

## Action

### Open the map
1. Go to **Analytics** in the sidebar.
2. Scroll to the **World Map** section of the dashboard. It's part of the Analytics page, not a separate route.

### Filter by category
1. In the filters panel, use the **Asset type** chips to select one or more categories (**Wine**, **Sparkling**, **Spirit**, **Cigar**), or leave **All categories** selected.
2. Both the map markers and the asset list below update immediately — filtering runs entirely in your browser against the inventory you already have loaded, so it's instant even before you touch the map.

### Switch to heatmap mode
1. Use the mode toggle above the map to switch from **Markers** to **Heatmap by type**.
2. Pick what the color represents from the type selector:
   - **Dominant category** — each region is colored by whichever category is most represented there.
   - A specific category (**Wine**, **Sparkling**, **Spirit**, **Cigar**) — each region's marker opacity scales with how many items of that category it holds, relative to your best-stocked region.
3. A color legend below the map explains which color maps to which category.

> [!TIP]
> Regions with none of the selected type show up visually neutral (very low opacity) rather than disappearing — so you can still see where your collection has gaps.

### Use the advanced filters panel
The filters panel (retractable, hides to leave more room for the map on small screens) includes:
- **Price** — min/max number fields.
- **Vintage / Year** — min/max number fields.
- **Rating** — a clickable list (`All ratings`, `1+★` … `5★`), not a slider.

  > [!CAUTION]
  > Rating comes from your tasting notes, not from the inventory itself, and is computed from your **50 most recent tastings only**. On a large collection this is an approximation, not the full tasting history — the panel shows a warning tooltip for this reason.

- **State** — `All`, `In cellar (unopened)`, or `Opened`.

All filters combine with the category filter and apply to both the map and the list below.

### Browse and open items from the list
1. Below the map, the filtered asset list shows each item's thumbnail, name, category badge, vintage, and location.
2. Click any row (or press Enter/Space while it's focused) to open that item's **detail card** in a modal — you stay on the Analytics page, there's no page navigation.
3. Click a marker on the map (or a region) to narrow the list to that region only; a chip appears showing the selected region with a button to clear it and go back to the full filtered list.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **Some of my items don't show up on the map at all** | They're missing a country/region value. Add one from the item's detail card — the map only plots items with that field set. |
| **Heatmap colors don't match what I expect** | Check the type selector above the legend — "Dominant category" colors by the most common category per region, which can differ from what a single-category heatmap would show. |
| **The rating filter seems to ignore some tastings** | It's based on your 50 most recent tasting notes only, by design — see the tooltip next to the Rating filter. It's an approximation for large collections, not a full historical query. |
| **Clicking an item does nothing / nothing opens** | Make sure you're clicking directly on the row (or list item), not the map marker — map markers narrow the list to a region, they don't open an item directly. |
| **The filters panel is gone on my phone** | It's collapsible by design on small screens to leave room for the map — look for the toggle to expand it back. |
