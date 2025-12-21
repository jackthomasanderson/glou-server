# ⚡ Wine Enrichment - Quick Reference

## In the UI

When adding a new wine:

1. **Barcode Scan:** Enter EAN code (12-14 digits) → Click 📱
2. **Name Search:** Type wine name → Click 🔍  
3. **Fields auto-fill** with enriched data
4. **Edit & Save** as usual

---

## API Endpoints

```bash
# By barcode (EAN)
POST /api/enrich/barcode
{ "barcode": "5010677001006" }

# By wine name
POST /api/enrich/name
{ "name": "Margaux", "producer": "Château", "vintage": "2015" }

# Spirit/Cocktail lookup
POST /api/enrich/spirit
{ "name": "Tequila" }

# Bulk enrich (array)
POST /api/enrich/bulk
[ {"name": "Latour"}, {"name": "Margaux"} ]
```

---

## Supported Formats

### Barcode (EAN-13)
- UPC codes: 12 digits
- EAN codes: 13 digits  
- Both supported via Open Food Facts

### Wine Name Search
- Works with: "Margaux", "Bordeaux", "Château Margaux"
- Searches Snooth (wine database)
- Falls back to Open Food Facts

### Spirit Names
- "Tequila", "Vodka", "Rum", "Whiskey", "Cognac"
- Also cocktails: "Margarita", "Mojito", "Daiquiri"
- Via TheCocktailDB (15K+ spirits/cocktails)

---

## Data Sources

| API | Best For | Auth | Rate |
|-----|----------|------|------|
| **Open Food Facts** | Barcode lookup, ABV | None | 10/sec |
| **Snooth** | Wine details, ratings | Free tier | 5/sec |
| **Global Wine Score** | Wine ratings | Free tier | 3/sec |
| **TheCocktailDB** | Spirits, cocktails | None | No limit |

---

## Response Time

| Query Type | Time | Source |
|-----------|------|--------|
| Barcode found | 2-3s | Open Food Facts |
| Wine by name | 3-5s | Snooth |
| Spirit lookup | 1-2s | TheCocktailDB |
| With ratings | 5-6s | Snooth + Global Wine Score |

---

## What Gets Filled

From enrichment, these fields can be populated:

- ✓ Name  
- ✓ Producer (Winery)
- ✓ Region  
- ✓ Type (Red/White/Rosé/Sparkling/Beer/Spirit)
- ✓ Vintage
- ✓ Alcohol Level (ABV %)
- ✓ Price (average market price)
- ✓ Rating (0-100)
- ✓ Description/Notes
- ✓ Image URL

You can edit any field after enrichment before saving.

---

## Common Barcodes

| Wine | EAN |
|------|-----|
| Château Margaux | 5010677001006 |
| Château Latour | 5010677001021 |
| Bordeaux generic | Various |

**Find barcode:** Look on bottle label (bottom, on side, or neck)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Barcode not found | Try name search or enter manually |
| Name search has no results | Try shorter/different name (e.g., "Bordeaux" vs "Château Something") |
| Fields missing data | Some APIs don't have all info - edit manually |
| Takes >30 sec | Network slow or API down - try again later |

---

## Under the Hood

**Architecture:**
- Modular API integration (easy to add sources)
- Multi-source fallback (if one fails, try next)
- Intelligent data merge (best quality from each API)
- 10s timeout per API call
- Source attribution (which API provided which field)

**No API Keys Required:**
- Uses only public/free APIs
- No login needed
- No data stored externally
- Privacy-friendly

---

## Next Features (Planned)

- 🔄 Local caching (avoid repeat searches)
- 📱 Mobile barcode scanner (camera integration)
- 📸 Image recognition (photo of label → enrich)
- 📥 Bulk CSV import with auto-enrichment
- 🎯 Liv-ex integration (professional pricing)

---

**For detailed docs:** See [ENRICHMENT.md](./ENRICHMENT.md)
