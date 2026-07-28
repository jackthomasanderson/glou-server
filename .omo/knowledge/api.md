# API — AGENTS.md

Express + TypeScript REST API for Glou. Port 3001.

## Architecture: Router → Service → Prisma

Three-layer pattern used consistently across all domains:

1. **Router** (`src/routes/*.router.ts`) — HTTP handlers, request parsing, Zod validation, audit logging, response formatting. No business logic.
2. **Service** (`src/services/*.service.ts`) — Business logic, database queries via Prisma, validation logic, alert computation. No HTTP concerns.
3. **Prisma** (`src/lib/prisma.ts`) — Singleton Prisma client with retry-on-connection-failure.

## Directory Layout

```
api/
├── src/
│   ├── index.ts           → Express app setup (middleware, routers, health check)
│   ├── lib/
│   │   └── prisma.ts      → Prisma client singleton
│   ├── middleware/
│   │   ├── auth.middleware.ts    → JWT auth + admin middleware
│   │   ├── error.middleware.ts   → Global error handler
│   │   └── upload.middleware.ts  → Multer file upload
│   ├── routes/
│   │   ├── auth.router.ts            → POST login/register/logout, 2FA
│   │   ├── inventory.router.ts       → CRUD bottles, soft-delete, QR codes
│   │   ├── cellars.router.ts         → CRUD cellars, slot management
│   │   ├── collections.router.ts     → CRUD collections
│   │   ├── tastings.router.ts        → CRUD tasting notes
│   │   ├── alerts.router.ts          → Peak maturity alerts
│   │   ├── analytics.router.ts       → Dashboard analytics
│   │   ├── search.router.ts          → Global search
│   │   ├── bulk-presets.router.ts    → Bulk action presets
│   │   ├── admin.router.ts           → Admin panel (user mgmt, audit log)
│   │   ├── user.router.ts            → User profile, preferences, account deletion
│   │   └── maturity-references.router.ts → Maturity window references
│   ├── services/
│   │   ├── audit.service.ts    → Audit logging (CREATE/READ/UPDATE/DELETE/RESTORE/LIST)
│   │   ├── inventory.service.ts → Bottle CRUD, trash, soft-delete, traceability
│   │   ├── cellar.service.ts   → Cellar management, grid slots
│   │   ├── alert.service.ts    → Peak maturity computation (alertStatus: none/approaching/peak/past)
│   │   ├── auth.service.ts     → Login, register, JWT generation, 2FA
│   │   ├── collections.service.ts → Collection management
│   │   ├── tastings.service.ts → Tasting notes CRUD
│   │   ├── analytics.service.ts → Dashboard statistics
│   │   ├── bulk-preset.service.ts → Bulk action presets
│   │   ├── maintenance.service.ts → Scheduled cleanup (expired accounts, orphaned avatars)
│   │   └── maturity-reference.service.ts → Maturity window references
│   └── schemas/
│       ├── auth.schema.ts
│       ├── inventory.schema.ts   → inventoryInputSchema, inventoryPatchSchema
│       ├── cellar.schema.ts
│       ├── collections.schema.ts
│       ├── tastings.schema.ts
│       ├── bulk-preset.schema.ts
│       ├── maturity-reference.schema.ts
│       └── user.schema.ts
├── prisma/
│   ├── schema.prisma        → Database schema (see api/prisma/AGENTS.md)
│   ├── seed.ts              → Seed data script
│   └── migrations/          → Prisma migration history
├── tests/                   → Vitest test files
├── tsconfig.json            → strict: true, noImplicitAny: true, target: ES2022
└── vitest.config.ts
```

## Router Pattern (MUST follow)

```typescript
import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { someSchema } from '../schemas/some.schema';
import { someService } from '../services/some.service';
import { auditLog } from '../services/audit.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);  // All routes require auth unless public

// Each route handler:
// 1. Extract params/body from req
// 2. Validate input via Zod schema
// 3. Call service layer
// 4. Log audit (void auditLog(...))
// 5. Return JSON response: { data: ... } on success, { error: 'ERROR_CODE' } on failure
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const items = await someService.listSome(req.userId);
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { count: items.length } });
    res.json({ data: items });
  } catch (error) {
    void auditLog({ userId: req.userId, action: 'LIST', status: 'error', ip, details: { message: String(error) } });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});
```

## Zod Validation Pattern

All API inputs must be validated via Zod schemas. Schemas live in `src/schemas/`.

```typescript
// In router:
const parsed = inventoryInputSchema.safeParse(req.body);
if (!parsed.success) {
  const zodError = parsed.error as ZodError;
  res.status(400).json({ error: 'VALIDATION_ERROR', details: zodError.errors });
  return;
}
```

## Auth Middleware

- `authMiddleware` — Extracts JWT from Bearer header or `glou_token` cookie. Verifies token, checks user is active, sets `req.userId` and `req.userEmail`. Returns `UNAUTHORIZED` (401), `TOKEN_INVALID_OR_EXPIRED` (401), `2FA_REQUIRED` (403), or `ACCOUNT_DEACTIVATED` (401).
- `adminMiddleware` — Must be used AFTER `authMiddleware`. Checks `isAdmin` flag. Returns `FORBIDDEN_ADMIN_ONLY` (403).
- `getClientIp(req)` — Extracts client IP (supports reverse proxies via x-forwarded-for / x-real-ip).

## Soft-Delete Pattern

All `InventoryItem` records use soft-delete via `deletedAt DateTime?` column.
- DELETE → sets `deletedAt = new Date()` (moves to trash)
- RESTORE → sets `deletedAt = null`
- Full queries filter `deletedAt: null`
- Trash route shows items with `deletedAt` set (7-day retention before purge)

## Audit Logging

Every route handler logs actions via `auditLog()`:
```typescript
void auditLog({
  userId: req.userId,
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'LIST',
  status: 'success' | 'error' | 'validation_error' | 'not_found',
  ip: getClientIp(req),
  bottleId: id ?? undefined,
  details: { ... }
});
```
Used with `void` (fire-and-forget) — never blocks the response.

## Error Codes (UPPER_SNAKE_CASE)

Always return errors as `{ error: 'UPPER_SNAKE_CASE' }`:
- `UNAUTHORIZED`, `TOKEN_INVALID_OR_EXPIRED`, `2FA_REQUIRED`, `ACCOUNT_DEACTIVATED`
- `FORBIDDEN_ADMIN_ONLY`
- `VALIDATION_ERROR` (includes `details: ZodError.errors`)
- `ITEM_NOT_FOUND`, `CELLAR_NOT_FOUND`
- `UNEXPECTED_ERROR`
- `SERVER_CONFIGURATION_ERROR`

## Never Do (API)

- Never use `any` in API contracts — all input validated via Zod
- Never suppress TypeScript errors (`as any`, `@ts-ignore`, `@ts-expect-error`)
- Never skip audit logging on data mutations
- Never expose Prisma errors directly to clients
- Never hardcode port — use `process.env.PORT ?? '3001'`