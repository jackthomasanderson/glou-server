# Wine Heatmap Feature - User Guide

## 🎯 What's New on the Dashboard?

You now have two interactive heatmap visualizations to understand your wine collection's geographic distribution:

## 1️⃣ Regional Heatmap Grid

Located at the top of the dashboard after the KPI widgets and data table.

### What You See:
- **Grid of colored tiles**, one for each wine region
- **Darker tiles** = More bottles stored in that region
- **Lighter tiles** = Fewer bottles in that region
- **Wine type badges** showing major types in each region
- **Total bottle count** displayed in each tile

### How to Use It:
1. **Scan the grid** to visually identify which regions have the most inventory
2. **Click any region tile** to expand and see detailed breakdown
3. **Review wine type percentages** in the expanded view
4. **Click another region or the expanded area** to collapse

### Example Interpretation:
```
Bordeaux (dark red, 45 bottles)
├─ Red: 42 bottles (93%)
├─ White: 3 bottles (7%)

Rhone (medium red, 17 bottles)
├─ Red: 15 bottles (88%)
├─ White: 2 bottles (12%)
```

---

## 2️⃣ Interactive Wine Map

Below the grid heatmap is an interactive SVG map of French wine regions.

### What You See:
- **Colored polygon map** of French wine regions
- **Color intensity** showing bottle concentration
- **Region labels with counts** on each area
- **Legend** explaining the color scale
- **Hover effects** to highlight regions

### How to Use It:
1. **Hover over regions** to see them highlighted
2. **Click any region** to open a detailed breakdown dialog
3. **Review the wine type distribution** in the popup
4. **Close dialog** by clicking outside it or on another region

### Color Scale:
- **Very Light Red (#FFE0E0)**: Very few bottles (<20% of max)
- **Light Red (#FFB3B3)**: Few bottles (20-40%)
- **Medium Red (#FF8080)**: Moderate amount (40-60%)
- **Dark Red (#CC4444)**: Many bottles (60-80%)
- **Very Dark Red (#990000)**: Highest concentration (>80%)

### Example Dialog:
```
┌─────────────────────────────────┐
│ Bordeaux                         │
├─────────────────────────────────┤
│ Premier wines from Graves,      │
│ Médoc, Pomerol, Saint-Émilion  │
│                                 │
│ Total Bottles: 45               │
│                                 │
│ By Wine Type:                   │
│ ▓▓▓▓▓▓▓▓▓ Red (42, 93%)        │
│ ░░ White (3, 7%)                │
└─────────────────────────────────┘
```

---

## 🗺️ Supported Wine Regions

The heatmaps automatically recognize and group wines from these French regions:

### 🍇 **Bordeaux**
- Famous for: Château Margaux, Pauillac, Pomerol, Saint-Émilion
- Typical wines: Red blends (Cabernet Sauvignon, Merlot)
- Profile: Rich, elegant, age-worthy

### 🍷 **Burgundy**
- Famous for: Pinot Noir, Chardonnay
- Typical wines: Côte d'Or, Côte de Beaune
- Profile: Refined, terroir-focused

### 🌄 **Rhone Valley**
- Famous for: Syrah, Grenache
- Typical wines: Châteauneuf-du-Pape, Côtes du Rhône
- Profile: Bold, spicy, fruit-forward

### 🌊 **Loire Valley**
- Famous for: Sauvignon Blanc, Cabernet Franc
- Typical wines: Sancerre, Chinon
- Profile: Fresh, crisp, elegant

### 🏔️ **Alsace**
- Famous for: Riesling, Gewürztraminer
- Typical wines: Alsatian aromatic whites
- Profile: Aromatic, dry to off-dry

### 🍾 **Champagne**
- Famous for: Sparkling wines
- Typical wines: Champagne AOC
- Profile: Elegant, celebratory, complex

### 🌸 **Provence**
- Famous for: Rosé wines
- Typical wines: Provence Rosé
- Profile: Dry, fresh, summery

### 🌾 **Languedoc-Roussillon**
- Famous for: Value wines, diversity
- Typical wines: Various red and white
- Profile: Diverse, good value

### 🏛️ **Southwest**
- Famous for: Cahors, regional specialties
- Typical wines: Cahors (Malbec), local varieties
- Profile: Distinctive, character-driven

---

## 📊 Use Cases & Insights

### Use Case 1: Understanding Collection Balance
**Question:** "Do I have a balanced collection across regions?"

**Answer:** Look at the grid heatmap:
- If Bordeaux is much darker than Loire, you have a Bordeaux-heavy collection
- If all tiles are similar shade, you have good regional balance

### Use Case 2: Identifying Gaps
**Question:** "Which regions should I focus on for future purchases?"

**Answer:** Look for light tiles:
- Lighter tiles represent underpopulated regions
- Consider expanding these regions in your collection
- Use this as a shopping guide

### Use Case 3: Wine Type Distribution
**Question:** "Am I collecting mainly reds or do I have good variety?"

**Answer:** Look at the wine type badges in each region:
- Check the percentages in the expanded view
- Identify regions where you're weak in specific types
- Plan purchases to balance your collection

### Use Case 4: Comparing Similar Regions
**Question:** "How do my Bordeaux holdings compare to Burgundy?"

**Answer:** 
- Use the map heatmap to visually compare colors
- Click both regions to compare exact numbers
- Make informed decisions about collection strategy

### Use Case 5: Planning Tastings
**Question:** "Which regions should I focus on for my next tasting event?"

**Answer:**
- Look for regions with highest bottle counts
- Check wine type distribution for variety
- Plan a diverse tasting across multiple types

---

## 💡 Tips & Tricks

### For Collectors:
- ✅ Use heatmaps to guide your collection strategy
- ✅ Track trends by checking regularly (visual memory)
- ✅ Identify your "specialty" regions (darkest tiles)
- ✅ Balance your collection with lighter tiles

### For Restaurants/Merchants:
- ✅ Understand inventory distribution quickly
- ✅ Identify regions with high/low stock
- ✅ Plan menu around available inventory
- ✅ Make purchasing decisions based on gaps

### For Wine Enthusiasts:
- ✅ Learn about French wine regions visually
- ✅ Discover which regions you've tasted
- ✅ Plan exploration strategy for new regions
- ✅ Share collection overview with friends

---

## ⚠️ Important Notes

### Region Name Matching
The heatmaps use **fuzzy matching** to recognize region names:
- ✅ "Bordeaux Red" → Matched to "Bordeaux"
- ✅ "Côtes du Rhône" → Matched to "Rhone"
- ✅ Case doesn't matter ("BURGUNDY" = "Burgundy")
- ❌ Completely unknown regions won't appear

**Tip:** Use standard region names in your wine data for best results.

### Data Updates
- Heatmaps fetch fresh data when you first load the dashboard
- They don't auto-refresh - reload the page to see latest data
- Adding/removing wines requires page refresh to see changes

### Empty Regions
- Regions with no wines don't appear in the grid
- The map shows all regions but with very light color if empty
- As you add wines, previously empty regions will appear

---

## 🔧 Troubleshooting

### "My regions aren't showing up"
**Problem:** You added wines but they don't appear in the heatmap

**Solutions:**
1. Ensure wines have the `region` field filled
2. Use standard region names (see list above)
3. Check capitalization (though it's case-insensitive)
4. Reload the page to refresh data
5. Check browser console for errors

### "All tiles are the same color"
**Problem:** The heatmap color scale appears flat

**Reasons:**
- All regions have very similar bottle counts
- You only have wines from one region
- This is actually correct behavior

**Solution:** Add wines to other regions to see color variation

### "Dialog doesn't show details"
**Problem:** You click a region but no dialog appears

**Solutions:**
1. Make sure you clicked on the map region polygon
2. Try clicking directly on the region color
3. Check if a dialog already opened behind current windows
4. Reload the page and try again

---

## 📈 What's Possible Next?

The heatmap system was built to be extensible. Future features might include:

- **Real Map Integration**: Replace SVG with actual geography
- **Time-Based Analysis**: See how distribution changed over time
- **Filtering**: Toggle wine types on/off dynamically
- **Export**: Download heatmaps as images or reports
- **Comparison**: Compare your collection vs. recommendations
- **Advanced Stats**: Per-region averages, price analysis, ratings
- **Deep Drill-down**: Click through to see individual bottles
- **Custom Regions**: Define your own regional groupings

---

## ❓ FAQ

**Q: Why do I need two heatmaps?**
A: Grid heatmap is better for quick scanning and comparing numbers. Map heatmap is better for understanding geographic distribution and seeing regional characteristics.

**Q: Can I change which regions are displayed?**
A: Currently regions are fixed. Future versions may support custom regions.

**Q: Why doesn't my region name match?**
A: The system does fuzzy matching but may not recognize all variations. Use standard French region names for best results.

**Q: Do the heatmaps update in real-time?**
A: No, they load data once when you visit the dashboard. Refresh the page to see updated data.

**Q: Can I export these visualizations?**
A: Not yet, but it's a planned feature. For now, you can take screenshots.

**Q: Why are wine type percentages shown?**
A: It helps you understand what types of wines dominate in each region (e.g., Bordeaux is mostly red).

---

Enjoy exploring your wine collection's geographic distribution! 🍷🗺️

---

## Developer Notes: Component README (merged)

The following developer-facing notes were consolidated from `web/src/components/HEATMAP_README.md` to keep component usage documentation alongside the user guide.

### Component Overview
This feature adds interactive heatmap visualizations to the Glou Dashboard to display wine bottle distribution across French wine regions. It helps you understand:

- **Geographic concentration**: Which regions have the most bottles in stock
- **Wine type distribution**: Compare Bordeaux reds vs Rhône varieties per region
- **Regional patterns**: Identify gaps in your collection

### Components

1. `RegionalHeatmapCard` (`/web/src/components/RegionalHeatmapCard.jsx`) — Grid-based heatmap displaying all regions as tiles.
	 - Color intensity represents bottle quantity (darker = more bottles)
	 - Click any region to see detailed wine type breakdown
	 - Shows percentage distribution of wine types per region
	 - Responsive grid layout

2. `WineMapHeatmap` (`/web/src/components/WineMapHeatmap.jsx`) — Interactive SVG map displaying French wine regions.
	 - Color gradient from light red (few bottles) to dark red (many bottles)
	 - Click regions to see detailed breakdown in a dialog
	 - Region descriptions for each wine area
	 - Legend showing intensity levels

### API dependency
Both components fetch data from the existing `GET /wines` endpoint. Each wine object must include: `id`, `name`, `region`, `type`, `quantity`.

### Integration snippet
```jsx
<Grid container spacing={2}>
	<Grid item xs={12}>
		<RegionalHeatmapCard />
	</Grid>
	<Grid item xs={12}>
		<WineMapHeatmap />
	</Grid>
</Grid>
```

For troubleshooting and future enhancement ideas, see the sections above in this guide.
