# 📖 Complete API Reference with Examples

All REST endpoints with curl examples, authentication, and error handling.

---

## Table of Contents

- [Authentication](#authentication)
- [Wines](#wines)
- [Caves & Cells](#caves--cells)
- [Consumption History](#consumption-history)
- [Alerts](#alerts)
- [Export & Import](#export--import)
- [Activity Logs](#activity-logs)
- [Admin](#admin)
- [Enrichment](#enrichment)
- [Error Handling](#error-handling)

---

## Authentication

### API Token Authentication

All endpoints require authentication via headers:

```bash
# Method 1: Bearer Token (recommended)
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  http://localhost:8080/api/wines

# Method 2: X-API-Token Header
curl -H "X-API-Token: YOUR_API_TOKEN" \
  http://localhost:8080/api/wines
```

### Get Your Token

1. Open Glou admin panel: `http://localhost:8080/admin`
2. Navigate to: Settings → API Tokens
3. Generate new token (or copy existing)
4. Use in requests

---

## Wines

### List All Wines

```bash
curl -X GET http://localhost:8080/api/wines \
  -H "Authorization: Bearer TOKEN"
```

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "Château Margaux",
    "region": "Bordeaux",
    "vintage": 2015,
    "type": "Red",
    "quantity": 2,
    "producer": "Château Margaux",
    "alcohol_level": 13.0,
    "price": 150.0,
    "rating": 4.5,
    "comments": "Excellent vintage",
    "consumed": 0,
    "min_apogee_date": "2025-01-01",
    "max_apogee_date": "2035-12-31",
    "cell_id": 5,
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

### Search Wines

```bash
# Search by name
curl -X GET "http://localhost:8080/api/wines/search?q=Margaux" \
  -H "Authorization: Bearer TOKEN"

# Search by region
curl -X GET "http://localhost:8080/api/wines/search?region=Bordeaux" \
  -H "Authorization: Bearer TOKEN"

# Search by vintage
curl -X GET "http://localhost:8080/api/wines/search?vintage=2015" \
  -H "Authorization: Bearer TOKEN"

# Combine filters
curl -X GET "http://localhost:8080/api/wines/search?q=Château&type=Red&vintage=2015" \
  -H "Authorization: Bearer TOKEN"
```

**Query Parameters:**
- `q` - Search query (name, region, producer)
- `region` - Filter by region
- `type` - Filter by type (Red, White, Rosé, Sparkling)
- `vintage` - Filter by vintage year
- `limit` - Results limit (default: 100)
- `offset` - Pagination offset (default: 0)

### Get Wine by ID

```bash
curl -X GET http://localhost:8080/api/wines/1 \
  -H "Authorization: Bearer TOKEN"
```

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "Château Margaux",
  "region": "Bordeaux",
  "vintage": 2015,
  "type": "Red",
  "quantity": 2,
  "cell_id": 5,
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Create Wine

```bash
curl -X POST http://localhost:8080/api/wines \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Château Margaux",
    "region": "Bordeaux",
    "vintage": 2015,
    "type": "Red",
    "quantity": 2,
    "producer": "Château Margaux",
    "alcohol_level": 13.0,
    "price": 150.0,
    "cell_id": 5,
    "min_apogee_date": "2025-01-01",
    "max_apogee_date": "2035-12-31",
    "comments": "Excellent vintage"
  }'
```

**Required Fields:**
- `name` (string)
- `region` (string)
- `vintage` (integer, year)
- `type` (string: Red, White, Rosé, Sparkling)

**Optional Fields:**
- `quantity` (integer, default: 1)
- `producer` (string)
- `alcohol_level` (float)
- `price` (float)
- `rating` (float, 0-5)
- `comments` (string)
- `cell_id` (integer)
- `min_apogee_date` (date: YYYY-MM-DD)
- `max_apogee_date` (date: YYYY-MM-DD)

**Response (201 Created):**
```json
{
  "id": 42,
  "name": "Château Margaux",
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Update Wine

```bash
curl -X PUT http://localhost:8080/api/wines/1 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 1,
    "rating": 4.8,
    "comments": "Amazing wine, drink soon"
  }'
```

**Response (200 OK):**
```json
{
  "id": 1,
  "message": "Wine updated successfully"
}
```

### Delete Wine

```bash
curl -X DELETE http://localhost:8080/api/wines/1 \
  -H "Authorization: Bearer TOKEN"
```

**Response (204 No Content)**

---

## Caves & Cells

### List All Caves

```bash
curl -X GET http://localhost:8080/api/caves \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Main Cellar",
    "model": "La Sommelière",
    "capacity": 100,
    "current": 45,
    "created_at": "2025-01-10T00:00:00Z"
  }
]
```

### Create Cave

```bash
curl -X POST http://localhost:8080/api/caves \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wine Fridge",
    "model": "Liebherr Premium",
    "capacity": 50
  }'
```

### List Cells in Cave

```bash
curl -X GET http://localhost:8080/api/caves/1/cells \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
[
  {
    "id": 1,
    "cave_id": 1,
    "location": "Shelf A, Row 1",
    "capacity": 5,
    "current": 3,
    "created_at": "2025-01-10T00:00:00Z"
  }
]
```

### Create Cell

```bash
curl -X POST http://localhost:8080/api/cells \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cave_id": 1,
    "location": "Shelf A, Row 2",
    "capacity": 5
  }'
```

---

## Consumption History

### Get Wine Tasting History

```bash
curl -X GET http://localhost:8080/api/wines/1/history \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
[
  {
    "id": 1,
    "wine_id": 1,
    "quantity": 1,
    "rating": 4.8,
    "notes": "Amazing! Excellent structure",
    "tasting_date": "2025-01-14",
    "created_at": "2025-01-14T19:00:00Z"
  }
]
```

### Record Consumption

```bash
curl -X POST http://localhost:8080/api/consumption \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wine_id": 1,
    "quantity": 1,
    "rating": 4.8,
    "notes": "Excellent! Drink now",
    "tasting_date": "2025-01-14"
  }'
```

**Response (201 Created):**
```json
{
  "id": 42,
  "message": "Consumption recorded"
}
```

---

## Alerts

### List All Alerts

```bash
curl -X GET http://localhost:8080/api/alerts \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
[
  {
    "id": 1,
    "wine_id": 1,
    "alert_type": "apogee_reached",
    "status": "active",
    "created_at": "2025-01-15T10:00:00Z",
    "dismissed_at": null
  }
]
```

### Create Alert

```bash
curl -X POST http://localhost:8080/api/alerts \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wine_id": 1,
    "alert_type": "apogee_reached"
  }'
```

**Alert Types:**
- `apogee_reached` - Wine is now in its peak drinking window
- `apogee_ending` - Peak window is closing soon
- `low_stock` - Only 1-2 bottles remaining

### Dismiss Alert

```bash
curl -X DELETE http://localhost:8080/api/alerts/1 \
  -H "Authorization: Bearer TOKEN"
```

**Response (204 No Content)**

---

## Export & Import

### Export All Data (JSON)

```bash
curl -X GET http://localhost:8080/api/export/json \
  -H "Authorization: Bearer TOKEN" \
  -o glou-backup.json
```

**Response:** Complete JSON backup

### Export Wines (CSV)

```bash
curl -X GET http://localhost:8080/api/export/wines-csv \
  -H "Authorization: Bearer TOKEN" \
  -o wines.csv
```

**CSV Format:**
```
ID,Name,Region,Vintage,Type,Quantity,...
1,Château Margaux,Bordeaux,2015,Red,2,...
```

### Export Caves (CSV)

```bash
curl -X GET http://localhost:8080/api/export/caves-csv \
  -H "Authorization: Bearer TOKEN" \
  -o caves.csv
```

### Export Tasting History (CSV)

```bash
curl -X GET http://localhost:8080/api/export/tasting-history-csv \
  -H "Authorization: Bearer TOKEN" \
  -o tastings.csv
```

### Import Data (JSON)

```bash
curl -X POST http://localhost:8080/api/import/json \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d @glou-backup.json
```

**Max File Size:** 50MB

**Response (200 OK):**
```json
{
  "message": "Data imported successfully"
}
```

---

## Activity Logs

### Get Activity Log (Admin Only)

```bash
curl -X GET "http://localhost:8080/api/admin/activity-log?limit=50&offset=0" \
  -H "Authorization: Bearer TOKEN"
```

**Query Parameters:**
- `limit` - Number of entries (default: 100, max: 1000)
- `offset` - Pagination offset (default: 0)
- `entity_type` - Filter by type (wine, cave, alert, etc.)

**Response:**
```json
[
  {
    "id": 1,
    "entity_type": "wine",
    "entity_id": 1,
    "action": "created",
    "details": "{\"name\": \"Château Margaux\"}",
    "ip_address": "192.168.1.100",
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

### Get Activity for Specific Wine

```bash
curl -X GET http://localhost:8080/api/admin/activity-log/wine/1 \
  -H "Authorization: Bearer TOKEN"
```

### Activity Actions

- `created` - New entity created
- `updated` - Entity modified
- `deleted` - Entity removed
- `tasted` - Wine tasted/consumed
- `exported` - Data exported

---

## Admin

### Get Settings

```bash
curl -X GET http://localhost:8080/api/admin/settings \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
{
  "app_title": "Glou",
  "app_slogan": "Wine Management System",
  "theme_color": "#007bff",
  "support_email": "admin@glou.local",
  "maintenance_mode": false
}
```

### Update Settings

```bash
curl -X PUT http://localhost:8080/api/admin/settings \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_title": "My Wine Collection",
    "theme_color": "#dc3545",
    "support_email": "support@example.com"
  }'
```

### Get Admin Statistics

```bash
curl -X GET http://localhost:8080/api/admin/stats \
  -H "Authorization: Bearer TOKEN"
```

**Response:**
```json
{
  "total_wines": 150,
  "total_caves": 3,
  "total_cells": 12,
  "total_consumed": 25,
  "active_alerts": 5,
  "database_size_mb": 2.5
}
```

---

## Enrichment

### Enrich by Barcode

```bash
curl -X POST http://localhost:8080/api/enrich/barcode \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "barcode": "5010394005087"
  }'
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

### Enrich by Name

```bash
curl -X POST http://localhost:8080/api/enrich/name \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Château Margaux 2015"
  }'
```

### Enrich Image (Barcode from Photo)

```bash
curl -X POST http://localhost:8080/api/enrich/image-barcode \
  -H "Authorization: Bearer TOKEN" \
  -F "image=@wine_label.jpg"
```

---

## Error Handling

### Common Error Responses

**400 Bad Request:**
```json
{
  "error": "Invalid request body",
  "message": "Missing required field: name"
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API token"
}
```

**404 Not Found:**
```json
{
  "error": "Not found",
  "message": "Wine with ID 999 not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

### Retry Logic

For transient failures, implement exponential backoff:

```bash
#!/bin/bash

for attempt in {1..3}; do
  response=$(curl -s -w "\n%{http_code}" \
    http://localhost:8080/api/wines)
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  if [ "$http_code" -eq 200 ]; then
    echo "Success!"
    exit 0
  fi
  
  if [ "$attempt" -lt 3 ]; then
    sleep $((2 ** attempt))  # Exponential backoff
  fi
done

echo "Failed after 3 attempts"
exit 1
```

---

## Rate Limiting

API has built-in rate limiting:

- **Limit:** 100 requests per minute per IP
- **Header:** `X-RateLimit-Remaining`
- **Response:** 429 Too Many Requests

```bash
# Check remaining requests
curl -I http://localhost:8080/api/wines \
  -H "Authorization: Bearer TOKEN" | grep X-RateLimit
```

---

## Pagination

For large result sets, use pagination:

```bash
# Get first 50
curl -X GET "http://localhost:8080/api/wines?limit=50&offset=0" \
  -H "Authorization: Bearer TOKEN"

# Get next 50
curl -X GET "http://localhost:8080/api/wines?limit=50&offset=50" \
  -H "Authorization: Bearer TOKEN"
```

---

## Version

Current API Version: **v1.0**

```bash
curl http://localhost:8080/api/version \
  -H "Authorization: Bearer TOKEN"
```

Response:
```json
{
  "version": "1.0.0",
  "api_version": "v1",
  "build_date": "2025-01-15"
}
```

---

## Support

API issues? Check:
1. Token is valid
2. Endpoint URL is correct
3. HTTP method matches documentation (GET, POST, etc.)
4. Request body is valid JSON
5. Content-Type header is set correctly

For help: [GitHub Issues](https://github.com/jackthomasanderson/glou-server/issues)
