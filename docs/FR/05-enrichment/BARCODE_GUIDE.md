# 🔍 Barcode Scanning Guide

Glou supports intelligent barcode scanning to auto-populate wine information. This guide covers setup and best practices.

---

## How It Works

1. **Scan Barcode** → Glou identifies wine
2. **Fetch Data** → Auto-fill name, region, vintage, type
3. **Enrich** → Optional: add price, alcohol level, producer
4. **Confirm & Save** → Manual adjustments if needed

---

## Barcode Scanning Methods

### Method 1: Android App Camera

**Best for:** On-the-go data entry, inventory management

```
1. Open Glou Android app
2. Tap "Add Wine" → "Scan Barcode"
3. Point camera at wine label barcode
4. App recognizes barcode
5. Data auto-fills
6. Review & Save
```

**Supported formats:**
- EAN-13 (European wine barcodes) ✅
- UPC-A (US wine barcodes) ✅
- Code128 (spirits, liqueurs) ✅
- QR codes (wine websites) ✅

### Method 2: Web Browser Barcode Input

**Best for:** Bulk data entry, desktop use

```
1. Open Glou web interface
2. Navigate to "Wines" → "Add Wine"
3. Click "Scan/Enter Barcode"
4. Either:
   - Use webcam to scan
   - Manually paste barcode number
5. System queries wine database
6. Fills in details
```

### Method 3: API Direct Integration

**Best for:** External systems, batch processing

```bash
# Enrich wine by barcode
curl -X POST http://localhost:8080/api/enrich/barcode \
  -H "Content-Type: application/json" \
  -d '{
    "barcode": "5010394005087"
  }'

# Response:
{
  "name": "Château Margaux",
  "region": "Bordeaux",
  "vintage": 2015,
  "type": "Red",
  "producer": "Château Margaux",
  "alcohol_level": 13.0,
  "price": 150.00
}
```

---

## Data Sources

Glou queries multiple wine databases for accuracy:

| Source | Coverage | Accuracy | Notes |
|--------|----------|----------|-------|
| **Vivaio API** | 500k+ wines | 95% | Primary source, EAN codes |
| **Wine Search API** | 200k+ wines | 90% | Fallback, detailed info |
| **Local Database** | Custom | 100% | Your previous entries |

**What gets auto-filled:**
- ✅ Wine name
- ✅ Region/appellation
- ✅ Vintage
- ✅ Wine type
- ✅ Producer
- ✅ Alcohol level
- ✅ Typical price range

**What requires manual entry:**
- ❓ Quantity (assume 1)
- ❓ Cell/cave location
- ❓ Purchase price (actual vs typical)
- ❓ Personal tasting notes

---

## Setup

### Android App

No setup required! Just:

```
1. Install Glou from Play Store (coming soon)
2. Go to Settings → Server Configuration
3. Enter: http://YOUR_IP:8080
4. Tap "Test Connection"
5. Start scanning!
```

### Web Browser

**Chrome/Edge (recommended):**
```
1. Open http://localhost:8080
2. Click "Add Wine" → "Scan Barcode"
3. Browser asks for camera permission
4. Allow access
5. Start scanning!
```

**Firefox:**
```
1. Allow camera access in Preferences
2. Navigate to Glou
3. Click barcode scanner
4. Same as Chrome
```

**Safari (macOS):**
```
1. Allow camera in System Preferences
2. Open Glou in Safari
3. Barcode scanning available
```

### Self-Hosted Server (API)

Barcode enrichment works automatically once Glou is running:

```bash
# No additional setup - just call the API
curl -X POST http://your-glou-server:8080/api/enrich/barcode \
  -H "Content-Type: application/json" \
  -d '{"barcode": "5010394005087"}'
```

---

## Usage Scenarios

### Scenario 1: Inventory Check-In

When receiving new wines:

```
1. Scan each bottle barcode
2. App populates details
3. Select cave/cell location
4. Save in batch
```

Perfect for:
- Restocking cellar
- Cataloging wine shipments
- Wedding/event wine inventory

### Scenario 2: Personal Library Entry

Building your wine collection:

```
1. Pick up wine bottle
2. Scan barcode with phone
3. App auto-fills most fields
4. Add tasting notes if desired
5. Save location info
```

Perfect for:
- Wine collectors
- Adding purchased wines
- Building digital cellar

### Scenario 3: Bulk Import (API)

For developers/integrations:

```bash
#!/bin/bash
# Scan 100 barcodes from CSV

while IFS=',' read barcode location; do
  curl -X POST http://localhost:8080/api/enrich/barcode \
    -H "Content-Type: application/json" \
    -d "{\"barcode\": \"$barcode\", \"cell_id\": $location}"
done < barcodes.csv
```

---

## Common Barcode Issues

### Issue: "Barcode Not Found"

**Cause:** Database doesn't have this wine

**Solutions:**
```
1. Check barcode number is correct (compare to bottle)
2. Try "Enrich by Name" instead
3. Manually enter wine data
4. Contribute to community database
```

### Issue: "Wrong Wine Returned"

**Cause:** Similar barcodes or database error

**Solutions:**
```
1. Verify barcode number
2. Check wine label carefully (format, edition)
3. Manually correct the data
4. Report incorrect match to wine database
```

### Issue: "Camera Not Working"

**Android:**
- Check app permissions: Settings → Apps → Glou → Permissions
- Grant Camera permission
- Restart app

**Web Browser:**
- Ensure HTTPS (if required by browser)
- Check browser camera permissions
- Try different browser
- Use manual barcode entry instead

### Issue: "Barcode Keeps Timing Out"

**Cause:** Network issue, API down, or very large dataset

**Solutions:**
```bash
# Test connectivity
curl -I http://localhost:8080/health

# Check API status
curl http://localhost:8080/api/admin/stats

# Increase timeout in requests
curl --max-time 30 -X POST http://localhost:8080/api/enrich/barcode ...

# Use manual entry as fallback
```

---

## Best Practices

✅ **Do:**
- Keep barcode clear and undamaged
- Position bottle at 45° angle to camera
- Good lighting for clearer scans
- Use app camera (faster than web)
- Test camera once after install
- Have manual entry ready as backup

❌ **Don't:**
- Rely only on barcode (always verify data)
- Scan damaged/faded barcodes
- Scan in poor lighting
- Point camera at reflection
- Rush the scan (take your time)
- Assume auto-filled data is 100% correct

---

## Batch Barcode Processing

### Process Multiple Wines at Once

**CSV Format (barcodes.csv):**
```
barcode,quantity,location
5010394005087,1,Cellar-A
5010394005094,2,Cellar-B
5010394005100,1,Temperature-Controlled
```

**Process Script:**
```bash
#!/bin/bash

while IFS=',' read barcode quantity location; do
  echo "Processing: $barcode"
  
  curl -X POST http://localhost:8080/api/enrich/barcode \
    -H "Content-Type: application/json" \
    -d "{
      \"barcode\": \"$barcode\",
      \"quantity\": $quantity,
      \"location\": \"$location\"
    }" && echo "✓ Success" || echo "✗ Failed"
    
  sleep 1  # Rate limit - 1 request per second
done < barcodes.csv
```

---

## Manual Data Entry (Fallback)

If barcode scanning doesn't work:

1. **By Wine Name:**
   ```bash
   curl -X POST http://localhost:8080/api/enrich/name \
     -H "Content-Type: application/json" \
     -d '{"name": "Château Margaux 2015"}'
   ```

2. **Manual Entry:**
   - Name: Château Margaux
   - Region: Bordeaux
   - Vintage: 2015
   - Type: Red Wine
   - Add manually in UI

---

## API Reference

### Barcode Enrichment

**Endpoint:** `POST /api/enrich/barcode`

**Request:**
```json
{
  "barcode": "5010394005087",
  "quantity": 1
}
```

**Response:**
```json
{
  "name": "Château Margaux",
  "region": "Bordeaux",
  "vintage": 2015,
  "type": "Red",
  "producer": "Château Margaux",
  "alcohol_level": 13.0,
  "price": 150.0,
  "source": "Vivaio API"
}
```

### Image Barcode Recognition

**Endpoint:** `POST /api/enrich/image-barcode`

**Request:** Multipart form with image

**Response:** Detected barcode + enriched data

---

## Troubleshooting

### Debug Mode

Enable detailed logging:

```bash
export DEBUG=true
export LOG_LEVEL=debug
./api
```

Check logs for enrichment issues:
```bash
grep "enrich\|barcode" glou.log | tail -20
```

### Test API Directly

```bash
# Test barcode enrichment
curl -v -X POST http://localhost:8080/api/enrich/barcode \
  -H "Content-Type: application/json" \
  -d '{"barcode": "5010394005087"}'

# Expected: 200 OK with wine data
# If error: Check API logs
```

---

## Support

Issues with barcode scanning?

1. Check Activity Log: `/api/admin/activity-log`
2. Verify barcode format (EAN-13 vs UPC-A)
3. Test with known barcode
4. Review [API Reference](./../04-api/API_REFERENCE.md)
5. Open issue: [GitHub](https://github.com/jackthomasanderson/glou-server/issues)

For barcode database issues: [Vivaio Report](https://vivaio.org/report)
