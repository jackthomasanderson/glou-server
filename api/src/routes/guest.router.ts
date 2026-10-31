import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { guestMiddleware } from '../middleware/guest.middleware';
import { routeParam } from '../lib/http';
import { AppError } from '../lib/errors';
import type { UnitWriteResult } from '../../../shared/product';
import { sharesService } from '../services/shares.service';
import { guestInventoryUpdateSchema } from '../schemas/inventory.schema';
import { inventoryService } from '../services/inventory.service';
import { auditLog } from '../services/audit.service';
import { getClientIp } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

// This is the only route family meant to be reachable by someone with no
// account on the instance (design.md), so it's the one realistic target for
// token brute-forcing (security audit finding). Keyed by IP, not by the
// `:token` param: an attacker enumerating the token space sends a DIFFERENT
// token on every request, so a per-token limiter would never see repeat
// keys and would never trip — only IP (or a global cap) actually throttles
// enumeration. Runs ahead of `guestMiddleware` so it also covers failed
// lookups (a wrong guess never gets past `findByToken`), not just requests
// against an already-valid share. Generous ceiling — a real guest browsing
// a shared cellar fires many GETs (list + per-item detail) in one sitting.
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),
});
router.use(guestLimiter);

// All routes in this router go through guestMiddleware which validates
// the token, expiry, and revocation status.
router.use(guestMiddleware);

// ─── GET /api/guest/:token ──────────────────────────────────────────────────
// Validate token and return share metadata (scope + masking options)

router.get('/', (_req: Request, res: Response): void => {
  const share = _req.guestShare!;
  res.json({
    data: {
      id: share.id,
      label: share.label,
      expiresAt: share.expiresAt,
      hidePrices: share.hidePrices,
      hideNotes: share.hideNotes,
      cellarIds: share.cellarIds,
      // Subset of cellarIds where the guest is also allowed to edit items (FEAT-37).
      writeCellarIds: share.writeCellarIds,
      collectionIds: share.collectionIds,
    },
  });
});

// ─── GET /api/guest/:token/inventory ────────────────────────────────────────
// List inventory items within the share scope

router.get('/inventory', async (req: Request, res: Response): Promise<void> => {
  const share = req.guestShare!;
  try {
    const items = await sharesService.getInventoryForShare(share);
    res.json({ data: items });
  } catch (error) {
    console.error('[guest] inventory error:', error);
    res.status(500).json({ error: 'FAILED_TO_FETCH_INVENTORY' });
  }
});

// ─── GET /api/guest/:token/inventory/:itemId ─────────────────────────────────
// Get a single item detail within the share scope

router.get('/inventory/:itemId', async (req: Request, res: Response): Promise<void> => {
  const share = req.guestShare!;
  const itemId = routeParam(req.params.itemId);
  try {
    const item = await sharesService.getItemForShare(share, itemId);
    if (!item) {
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }
    res.json({ data: item });
  } catch (error) {
    console.error('[guest] item detail error:', error);
    res.status(500).json({ error: 'FAILED_TO_FETCH_ITEM' });
  }
});

// ─── PATCH /api/guest/:token/inventory/:itemId ───────────────────────────────
// Restricted edit for guests granted write access on the item's cellar (FEAT-37).
// Scope is intentionally limited to consumption/service state — no create, no
// delete, no pricing fields — regardless of the share's hidePrices flag.

router.patch('/inventory/:itemId', async (req: Request, res: Response): Promise<void> => {
  const share = req.guestShare!;
  const itemId = routeParam(req.params.itemId);
  const ip = getClientIp(req);

  try {
    const item = await sharesService.getItemForShare(share, itemId);
    if (!item) {
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }

    if (!sharesService.canWriteCellar(share, item.cellarId)) {
      void auditLog({
        userId: share.userId,
        action: 'GUEST_UPDATE',
        status: 'error',
        ip,
        bottleId: itemId,
        details: { via: 'guest_share', shareId: share.id, inviteeName: share.inviteeName, reason: 'READ_ONLY_ACCESS' },
      });
      res.status(403).json({ error: 'READ_ONLY_ACCESS' });
      return;
    }

    const patch = guestInventoryUpdateSchema.parse(req.body);
    const result = await inventoryService.updateItem(share.userId, itemId, patch);

    if (!result) {
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }
    if ('conflict' in result) {
      // Structurally unreachable: `guestInventoryUpdateSchema` is `.strict()`
      // and never carries `expectedUpdatedAt` (FEAT-16/23 offline sync is
      // scoped to the authenticated app, not the guest share routes). Kept
      // exhaustive for type-safety against `InventoryService.updateItem`.
      res.status(409).json({ error: 'CONFLICT', data: result.serverItem });
      return;
    }

    void auditLog({
      userId: share.userId,
      action: 'GUEST_UPDATE',
      status: 'success',
      ip,
      // #471 (D8): logged on the unit that now carries the state (a detached sub-record).
      bottleId: result.item.id,
      productId: result.item.productId,
      details: {
        via: 'guest_share', shareId: share.id, inviteeName: share.inviteeName, changes: result.changes,
        ...(result.outcome ? { outcome: result.outcome, targetItemId: itemId } : {}),
      },
    });
    // The group's own history: one copy fewer (detached) or one more (reattached).
    if (result.groupChange) {
      const { itemId: groupId, from, to } = result.groupChange;
      void auditLog({
        userId: share.userId,
        action: 'GUEST_UPDATE',
        status: 'success',
        ip,
        bottleId: groupId,
        productId: result.item.productId,
        details: { via: 'guest_share', shareId: share.id, inviteeName: share.inviteeName, changes: [{ field: 'quantity', from, to }], outcome: result.outcome },
      });
    }

    // ISSUE_483: `result.item` is the full row (purchase price, estimated
    // value, notes…). Re-read it through the share's own select so the
    // response honours hidePrices/hideNotes exactly like the read routes.
    // #471 (D8): the unit carrying the state, and the other units written.
    const visible = await sharesService.getItemForShare(share, result.item.id);
    const changed = await Promise.all(result.changed.map((unit) => sharesService.getItemForShare(share, unit.id)));
    type SharedUnit = NonNullable<typeof visible>;
    const response: UnitWriteResult<typeof visible, SharedUnit> = {
      data: visible, changed: changed.filter((unit): unit is SharedUnit => unit != null), removedIds: result.removedIds,
    };
    res.json(response);
  } catch (error) {
    if (error instanceof AppError) {
      // #471: a write the detach / reattach rule refuses (TASTINGS_ON_ITEM…).
      res.status(error.status).json({ error: error.code, details: error.details });
      return;
    }
    if (error instanceof ZodError) {
      const issues = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      void auditLog({
        userId: share.userId,
        action: 'GUEST_UPDATE',
        status: 'validation_error',
        ip,
        bottleId: itemId,
        details: { via: 'guest_share', shareId: share.id, issues },
      });
      res.status(400).json({ error: 'VALIDATION_ERROR', details: issues });
      return;
    }
    console.error('[guest] update error:', error);
    void auditLog({
      userId: share.userId,
      action: 'GUEST_UPDATE',
      status: 'error',
      ip,
      bottleId: itemId,
      details: { via: 'guest_share', shareId: share.id, message: String(error) },
    });
    res.status(500).json({ error: 'FAILED_TO_UPDATE_ITEM' });
  }
});

export default router;
