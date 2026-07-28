# Prisma — AGENTS.md

Database schema, migrations, and seed for Glou (PostgreSQL).

## Schema Design

Schema lives at `api/prisma/schema.prisma`. PostgreSQL via `DATABASE_URL` environment variable.

**Client configuration:**
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}
```

## Models

| Model | Table | Description |
|---|---|---|
| `User` | `users` | Accounts with auth, preferences, 2FA, admin flag, soft-delete support (deletionRequestedAt) |
| `Cellar` | `cellars` | Storage locations with optional grid layout (columns/rows/hotZoneRows/coldZoneRows) |
| `InventoryItem` | `bottles` | Core asset model supporting wine/sparkling/spirit/cigar with contextual fields and soft-delete |
| `AuditLog` | `audit_logs` | Immutable action log (CREATE/READ/UPDATE/DELETE/RESTORE/LIST) with IP, status, details |
| `MaturityReference` | `maturity_references` | Drink window definitions for auto-computing alertStatus |
| `BulkPreset` | `bulk_presets` | Saved inventory patch templates for bulk operations |
| `Collection` | `collections` | Named groups of inventory items with color + icon |
| `TastingNote` | `tasting_notes` | Tasting records with rating, readiness, food pairing, photo |

## Key Relationships

```
User 1──* Cellar
User 1──* InventoryItem
Cellar 1──* InventoryItem (optional, cellarId nullable)
User 1──* AuditLog
InventoryItem 1──* AuditLog (optional, bottleId nullable)
User 1──* BulkPreset
User 1──* Collection
Collection *──* InventoryItem (many-to-many, "CollectionItems" relation)
User 1──* TastingNote
InventoryItem 1──* TastingNote (optional, itemId nullable)
```

## Enums

- `BottleCategory`: wine, sparkling, spirit, cigar
- `Theme`: LIGHT, DARK
- `Language`: FR, EN
- `TempUnit`: CELSIUS, FAHRENHEIT
- `DateFormat`: SYSTEM, H24, H12
- `CellarType`: VINTAGE (aging cellar), COOLER (service fridge), SHELF (passive storage)
- `MaturityMode`: ABSOLUTE (fixed years), RELATIVE (years from vintage)
- `TastingReadiness`: TOO_YOUNG, PERFECT, PEAK, PAST

## InventoryItem Design

The `InventoryItem` model uses a "wide table" pattern with **contextual fields** — fields applicable to certain categories only:

- **Common**: name, producer, category, location, photoUrl, notes, purchasePrice, tags
- **Wine / Sparkling**: vintage, color, region, grapeVarieties, alcoholDegree, bottleSize, needsAeration, serviceTemp, lotNumber
- **Sparkling extras**: sparklingType, sugarLevel, disgorgingDate, baseYear
- **Spirit**: spiritType, edition, declaredAge, caskType, additions, aromaticProfile
- **Cigar**: format, quantity, manufactureYear, leafOrigin, factoryCode, recommendedHumidity, humidificationSystem

**Soft-delete**: `deletedAt DateTime?` — set when moved to trash, 7-day retention before permanent purge. All normal queries filter `deletedAt: null`.

**Alert status**: `alertStatus String?` — auto-computed by `alert.service.ts`:
- `none` — no maturity window defined
- `approaching` — within 1 year of peak window start
- `peak` — within peak window
- `past` — after peak window end

**Peak maturity**: `peakMaturityFrom` / `peakMaturityTo` (year integers) define the optimal drinking window. `alertsPaused` allows users to silence alerts per bottle.

**Traceability**: `updatedBy` (last editor userId) tracked per mutation. `lockedFields` prevents auto-enrichment from overwriting user-set values.

## Index Strategy

```prisma
@@index([userId])              // User-scoped queries
@@index([userId, deletedAt])   // Filtered listing
@@index([userId, category])    // Category filtering
@@index([alertStatus])         // Alert queries
@@index([name])                // Search
@@index([vintage])             // Vintage filtering
@@index([producer])            // Producer search
```

## Migration Workflow

```bash
# 1. Edit schema.prisma
# 2. Generate migration
npx prisma migrate dev --name descriptive_name
# 3. Verify generated SQL in prisma/migrations/
# 4. Commit migration files
# 5. Deploy: npx prisma migrate deploy
```

## Seed Script

`api/prisma/seed.ts` — populates development database. Run via:
```bash
npm run db:seed
# or
npx ts-node --transpile-only prisma/seed.ts
```

## Prisma Client

`api/src/lib/prisma.ts` exports a singleton with retry-on-connection-failure:
```typescript
export const prisma = new PrismaClient();
export async function connectWithRetry(retries = 5, delay = 2000): Promise<void> { ... }
```

Called on app startup in `api/src/index.ts`.

## Never Do (Prisma)

- Never edit migration files after they've been committed
- Never use `$queryRaw` for queries that can be expressed via Prisma Client
- Never skip migrations — always create a new migration for schema changes
- Never commit schema changes without the corresponding migration files
- Never hardcode `DATABASE_URL` — always use environment variable