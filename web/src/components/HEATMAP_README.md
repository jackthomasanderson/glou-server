# Wine Regional Distribution Heatmap Feature

## Overview
This feature adds interactive heatmap visualizations to the Glou Dashboard to display wine bottle distribution across French wine regions. It helps you understand:

- **Geographic concentration**: Which regions have the most bottles in stock
- **Wine type distribution**: Compare Bordeaux reds vs Rhône varieties per region
- **Regional patterns**: Identify gaps in your collection

## Components

### 1. RegionalHeatmapCard (`/web/src/components/RegionalHeatmapCard.jsx`)
Grid-based heatmap displaying all regions as tiles.

**Features:**
- Color intensity represents bottle quantity (darker = more bottles)
- Click any region to see detailed wine type breakdown
- Shows percentage distribution of wine types per region
- Responsive grid layout
- Aggregates wines by region automatically

**Usage:**
```jsx
import { RegionalHeatmapCard } from '../components/RegionalHeatmapCard';

<RegionalHeatmapCard />
```

### 2. WineMapHeatmap (`/web/src/components/WineMapHeatmap.jsx`)
Interactive SVG map displaying French wine regions.

**Features:**
- Visual map of French wine regions as colored polygons
- Color gradient from light red (few bottles) to dark red (many bottles)
- Click regions to see detailed breakdown in a dialog
- Region descriptions for each wine area
- Legend showing intensity levels
- Hover effects for better interactivity

**Usage:**
```jsx
import { WineMapHeatmap } from '../components/WineMapHeatmap';

<WineMapHeatmap />
```

## Supported Regions

Both components automatically aggregate wines into these regions:

1. **Bordeaux** - Premier wines from Graves, Médoc, Pomerol, Saint-Émilion
2. **Burgundy** - Pinot Noir and Chardonnay specialists
3. **Rhone Valley** - Syrah and Grenache wines
4. **Loire Valley** - Sauvignon Blanc and Cabernet Franc
5. **Alsace** - Riesling and Gewürztraminer
6. **Champagne** - Sparkling wine capital
7. **Provence** - Rosé wine heartland
8. **Languedoc-Roussillon** - Value wines and diversity
9. **Southwest** - Cahors and local specialties

**Note:** Region names are normalized. The components will attempt to match your wine region strings to these categories (case-insensitive).

## How It Works

### Data Flow
1. Components fetch all wines from `/wines` API endpoint
2. Wines are grouped by region
3. Each region's wines are further grouped by wine type (Red, White, Rosé, Sparkling)
4. Bottle quantities are summed per region
5. Intensity color is calculated based on normalized bottle count
6. UI is rendered with color-coded heatmap

### Region Normalization
The components include fuzzy matching to handle various region name formats:
- "Bordeaux Red", "Bordeaux AOC" → matched to "Bordeaux"
- "Côtes du Rhône" → matched to "Rhone"
- Case-insensitive matching

### Color Scale
Both components use a red color gradient:
- **#FFE0E0** - Very Low (<20% of max)
- **#FFB3B3** - Low (20-40%)
- **#FF8080** - Medium (40-60%)
- **#CC4444** - High (60-80%)
- **#990000** - Very High (>80%)

## API Dependencies

Both components require the existing `/wines` endpoint:

```
GET /wines
Response: Array<Wine>
```

Each wine object must have:
- `id`: number
- `name`: string
- `region`: string (matched against supported regions)
- `type`: string ("Red", "White", "Rosé", "Sparkling")
- `quantity`: number

## Integration

The components are integrated into `DashboardScreen.jsx`:

```jsx
<Grid container spacing={2}>
  {/* Regional Heatmap Grid View */}
  <Grid item xs={12}>
    <RegionalHeatmapCard />
  </Grid>

  {/* Interactive Map Heatmap */}
  <Grid item xs={12}>
    <WineMapHeatmap />
  </Grid>

  {/* Other dashboard content... */}
</Grid>
```

## Styling

Both components follow the Material Design 3 (MD3) design system used throughout Glou:
- Uses theme colors and palettes
- Responsive design with proper spacing
- Smooth transitions and hover effects
- Accessible contrast ratios
- Consistent typography

## Future Enhancements

Potential improvements:
1. **Real geographic map**: Replace SVG with Leaflet/Mapbox for actual France geography
2. **Year-over-year comparison**: Show distribution changes over time
3. **Export capability**: Download heatmap as image or CSV
4. **Filtering**: Toggle wine types on/off to see filtered distribution
5. **Drilldown to wines**: Click heatmap to see individual bottles
6. **Statistics**: Average price per region, newest additions, etc.
7. **Custom regions**: Allow users to create and track custom regions

## Troubleshooting

### No data appears
- Verify wines exist in database: check `/wines` endpoint
- Ensure wines have `region` and `type` fields populated
- Check browser console for API errors

### Region matching not working
- Review the normalized region name list above
- Update wine region strings to match supported regions more closely
- Consider adding custom region normalization rules

### Heatmap colors all the same
- This is expected if all regions have similar bottle counts
- The scale normalizes based on max quantity
- Check total quantities with the grid heatmap first

