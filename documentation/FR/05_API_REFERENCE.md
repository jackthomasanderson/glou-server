# 🍷 Glou API Reference

**Base URL:** `http://localhost:8080/api`  
**Version:** 1.0  
**Content-Type:** `application/json`

---

## 📋 Authentification

**Phase 1 (Actuelle):** Aucune authentification (single-user)  
**Phase 2 (TODO):** JWT Bearer token

```bash
# Phase 2 exemple
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." http://localhost:8080/api/wines
```

---

## 🍷 WINES - Gestion des Bouteilles

### 1. GET /api/wines - Lister toutes les vins
```bash
curl http://localhost:8080/api/wines

# Avec filtres
curl "http://localhost:8080/api/wines?type=rouge&appellation=Bordeaux&min_rating=4"
curl "http://localhost:8080/api/wines?cave_id=1&cell_id=5"
```

**Query Parameters:**
- `type` - "rouge", "blanc", "rosé", "pétillant"
- `appellation` - String search
- `min_rating` - 0-5
- `cave_id` - Filtrer par cave
- `cell_id` - Filtrer par cellule
- `page` - 1-based (défaut: 1)
- `limit` - Per page (défaut: 50)

**Réponse:**
```json
{
  "wines": [
    {
      "id": 1,
      "name": "Château Lafite Rothschild",
      "type": "rouge",
      "vintage": 2015,
      "appellation": "Pauillac",
      "producer": "Château Lafite",
      "alcool": 13.5,
      "price": 450.00,
      "rating": 95,
      "comments": "Excellent concentration, très boisé",
      "quantity": 3,
      "cave_id": 1,
      "cell_id": 5,
      "min_apogee": "2025-01-01T00:00:00Z",
      "max_apogee": "2045-12-31T23:59:59Z",
      "consumed": false,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 42,
  "page": 1
}
```

---

### 2. GET /api/wines/:id - Détails d'un vin
```bash
curl http://localhost:8080/api/wines/1
```

**Réponse:** Même structure que wine object ci-dessus

---

### 3. POST /api/wines - Créer un nouveau vin
```bash
curl -X POST http://localhost:8080/api/wines \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Château Margaux",
    "type": "rouge",
    "vintage": 2018,
    "appellation": "Margaux",
    "producer": "Château Margaux",
    "alcool": 13.2,
    "price": 380.00,
    "rating": 94,
    "comments": "Bel équilibre, aging potential 30+",
    "quantity": 2,
    "cave_id": 1,
    "cell_id": 3,
    "min_apogee_year": 2026,
    "max_apogee_year": 2050
  }'
```

**Validation:**
- `name` - Required, 1-200 chars
- `type` - Required, enum: rouge|blanc|rosé|pétillant
- `vintage` - 1950-2025
- `appellation` - 1-100 chars
- `quantity` - ≥1
- `cave_id` - Foreign key to caves
- `min_apogee_year`, `max_apogee_year` - Integers, min < max

**Réponse (201):**
```json
{
  "id": 43,
  "created_at": "2025-01-21T14:22:00Z"
}
```

---

### 4. PUT /api/wines/:id - Modifier un vin
```bash
curl -X PUT http://localhost:8080/api/wines/1 \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 96,
    "comments": "Updated after tasting"
  }'
```

**Réponse (200):** Updated wine object

---

### 5. DELETE /api/wines/:id - Supprimer un vin
```bash
curl -X DELETE http://localhost:8080/api/wines/1
```

**Réponse (204):** No content

---

### 6. GET /api/wines/to-drink-now - Vins prêts à boire
```bash
curl http://localhost:8080/api/wines/to-drink-now?limit=10
```

**Logique:** `min_apogee_date <= TODAY <= max_apogee_date`  
**Tri:** Par expiration croissante (urgent d'abord)

**Réponse:**
```json
{
  "wines": [
    {
      "id": 5,
      "name": "Bourgueil 2015",
      "max_apogee": "2026-03-01T00:00:00Z",
      "days_until_peak_end": 42
    }
  ]
}
```

---

## 🏰 CAVES - Gestion des Caves

### 1. GET /api/caves - Lister toutes les caves
```bash
curl http://localhost:8080/api/caves
```

**Réponse:**
```json
{
  "caves": [
    {
      "id": 1,
      "name": "Sous-sol château",
      "location": "Maison",
      "temperature": 12.5,
      "humidity": 65,
      "capacity": 500,
      "created_at": "2025-01-10T09:00:00Z"
    }
  ]
}
```

---

### 2. POST /api/caves - Créer une cave
```bash
curl -X POST http://localhost:8080/api/caves \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cave climatisée",
    "location": "Garage",
    "temperature": 12.0,
    "humidity": 70,
    "capacity": 1000
  }'
```

---

### 3. GET /api/caves/:id/capacity - Utilisation capacité
```bash
curl http://localhost:8080/api/caves/1/capacity
```

**Réponse:**
```json
{
  "cave_id": 1,
  "name": "Sous-sol château",
  "capacity": 500,
  "used": 342,
  "available": 158,
  "percentage": 68.4
}
```

---

## 📍 CELLS - Cellules de Rangement

### 1. POST /api/caves/:cave_id/cells - Créer une cellule
```bash
curl -X POST http://localhost:8080/api/caves/1/cells \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Étagère A1",
    "position": "Coin nord-est",
    "capacity": 50,
    "wine_types": ["rouge", "rosé"]
  }'
```

---

### 2. GET /api/cells/:id - Détails cellule
```bash
curl http://localhost:8080/api/cells/5
```

**Réponse:**
```json
{
  "id": 5,
  "cave_id": 1,
  "name": "Étagère A1",
  "wines_count": 32,
  "capacity": 50,
  "available_slots": 18
}
```

---

## 🚨 ALERTS - Alertes Intelligentes

### 1. GET /api/alerts - Lister les alertes
```bash
curl http://localhost:8080/api/alerts?active=true
```

**Réponse:**
```json
{
  "alerts": [
    {
      "id": 1,
      "wine_id": 3,
      "type": "apogee_approaching",
      "message": "Château Pichon Longueville approche l'apogée",
      "severity": "urgent",
      "created_at": "2025-01-15T00:00:00Z",
      "triggered_at": "2025-01-20T08:00:00Z",
      "acknowledged": false
    }
  ]
}
```

**Types d'alertes:**
- `apogee_approaching` - À 6 mois de l'expiration max
- `past_apogee` - Après max_apogee_date
- `temperature_out_of_range` - Cave hors température optimale
- `humidity_out_of_range` - Humidité anormale
- `capacity_full` - Cave remplie à 90%+

---

### 2. POST /api/alerts/:id/acknowledge - Reconnaître une alerte
```bash
curl -X POST http://localhost:8080/api/alerts/1/acknowledge
```

---

### 3. DELETE /api/alerts/:id - Supprimer une alerte
```bash
curl -X DELETE http://localhost:8080/api/alerts/1
```

---

## 📖 JOURNAL - Journal de Bord de Dégustation

### 1. POST /api/journal - Enregistrer une consommation
```bash
curl -X POST http://localhost:8080/api/journal \
  -H "Content-Type: application/json" \
  -d '{
    "wine_id": 5,
    "reason": "dégustation",
    "date": "2025-01-20T19:30:00Z",
    "tasting_notes": "Nez de fruits noirs, bouche ample",
    "rating": 8.5,
    "occasion": "Repas entre amis"
  }'
```

**Raisons valides:**
- `vente` - Vendu
- `dégustation` - Dégusté
- `cadeau` - Offert
- `perte` - Perdu/cassé

---

### 2. GET /api/journal - Historique consommations
```bash
curl "http://localhost:8080/api/journal?wine_id=5&limit=20"
```

**Réponse:**
```json
{
  "entries": [
    {
      "id": 42,
      "wine_id": 5,
      "reason": "dégustation",
      "date": "2025-01-20T19:30:00Z",
      "tasting_notes": "Nez de fruits noirs, bouche ample",
      "rating": 8.5,
      "quantity_consumed": 1
    }
  ]
}
```

---

### 3. GET /api/journal/stats - Statistiques personnelles
```bash
curl http://localhost:8080/api/journal/stats
```

**Réponse:**
```json
{
  "total_consumed": 47,
  "total_by_reason": {
    "dégustation": 35,
    "vente": 8,
    "cadeau": 3,
    "perte": 1
  },
  "average_rating": 7.8,
  "favorite_types": {
    "rouge": 28,
    "blanc": 12,
    "rosé": 7
  }
}
```

---

## 🔍 SEARCH - Recherche Avancée

### 1. GET /api/search - Recherche multi-champs
```bash
curl "http://localhost:8080/api/search?q=Lafite&type=rouge&rating_min=90"
```

**Paramètres:**
- `q` - Text search (name, appellation, producer)
- `type` - Filter par type
- `rating_min` - Rating minimum
- `apogee_status` - "drinkable_now", "not_ready", "past"

**Réponse:** Array de wines matching

---

## 📊 STATS - Tableau de Bord

### 1. GET /api/stats/overview - Résumé général
```bash
curl http://localhost:8080/api/stats/overview
```

**Réponse:**
```json
{
  "total_wines": 127,
  "total_bottles": 287,
  "wines_to_drink_now": 12,
  "total_caves": 3,
  "total_alerts": 5,
  "value_estimate": 15000.00
}
```

---

### 2. GET /api/stats/by-type - Distribution par type
```bash
curl http://localhost:8080/api/stats/by-type
```

**Réponse:**
```json
{
  "rouge": 89,
  "blanc": 32,
  "rosé": 4,
  "pétillant": 2
}
```

---

### 3. GET /api/stats/by-region - Répartition régions
```bash
curl http://localhost:8080/api/stats/by-region
```

---

## 🔧 ADMIN - Maintenance

### 1. POST /api/admin/backup - Créer un backup
```bash
curl -X POST http://localhost:8080/api/admin/backup
```

**Réponse:**
```json
{
  "backup_id": "2025-01-21-14-22-36",
  "size_bytes": 2048000,
  "created_at": "2025-01-21T14:22:36Z"
}
```

---

### 2. GET /api/health - Health check
```bash
curl http://localhost:8080/api/health
```

**Réponse:**
```json
{
  "status": "healthy",
  "db": "connected",
  "uptime_seconds": 3600
}
```

---

## ⚠️ ERROR RESPONSES

### Format Standard
```json
{
  "error": "Invalid request",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "quantity",
      "message": "must be >= 1"
    }
  ]
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (auth required, Phase 2) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## 🔐 RATE LIMITING

**Default Limits:**
- Development: 1000 requests/minute per IP
- Staging: 200 requests/minute per IP
- Production: 100 requests/minute per IP

**Headers de Response:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1705851756
```

**Dépassement (429):**
```json
{
  "error": "Too many requests",
  "retry_after_seconds": 60
}
```

---

## 📌 EXEMPLES COMPLETS

### Cas d'Usage 1: Créer une cave avec cellules et ajouter du vin

```bash
# 1. Créer la cave
CAVE=$(curl -s -X POST http://localhost:8080/api/caves \
  -H "Content-Type: application/json" \
  -d '{"name":"Mon Sous-sol","location":"Maison","temperature":12,"humidity":70,"capacity":200}')
CAVE_ID=$(echo $CAVE | jq .id)

# 2. Créer une cellule
CELL=$(curl -s -X POST http://localhost:8080/api/caves/$CAVE_ID/cells \
  -H "Content-Type: application/json" \
  -d '{"name":"Étagère 1","position":"Mur nord","capacity":50}')
CELL_ID=$(echo $CELL | jq .id)

# 3. Ajouter un vin
curl -X POST http://localhost:8080/api/wines \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Château X\",\"type\":\"rouge\",\"vintage\":2015,\"cave_id\":$CAVE_ID,\"cell_id\":$CELL_ID,\"quantity\":3}"
```

---

### Cas d'Usage 2: Rechercher et déguster

```bash
# 1. Trouver vins à boire maintenant
WINES=$(curl -s "http://localhost:8080/api/wines/to-drink-now?limit=5")

# 2. Enregistrer la dégustation du premier
WINE_ID=$(echo $WINES | jq '.wines[0].id')
curl -X POST http://localhost:8080/api/journal \
  -H "Content-Type: application/json" \
  -d "{\"wine_id\":$WINE_ID,\"reason\":\"dégustation\",\"rating\":8.5,\"tasting_notes\":\"Excellent!\"}"
```

---

## 📚 Ressources

- **Documentation Frontend:** Voir `assets/glou.html`
- **Configuration Serveur:** Voir `.env.example`
- **Sécurité:** Voir `SECURITY_CHECKLIST.md`
- **Meilleures Pratiques:** Voir `BEST_PRACTICES.md`

---

**Version API:** 1.0.0  
**Dernière mise à jour:** 2025-01-21  
**Status:** 🟢 Production Ready
