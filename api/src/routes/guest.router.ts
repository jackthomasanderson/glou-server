import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { guestMiddleware } from '../middleware/guest.middleware';
import { sharesService } from '../services/shares.service';
import { guestInventoryUpdateSchema } from '../schemas/inventory.schema';
import { inventoryService } from '../services/inventory.service';
import { auditLog } from '../services/audit.service';
import { getClientIp } from '../middleware/auth.middleware';

const router = Router({ mergeParams: true });

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
  const { itemId } = req.params;
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
  const { itemId } = req.params;
  const ip = getClientIp(req);

  try {
    const item = await sharesService.getItemForShare(share, itemId);
    if (!item) {
      res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return;
    }

    if (!sharesService.canWriteCellar(share, item.cellarId)) {
      void auditLog({
        userId: share.createdBy,
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
    const result = await inventoryService.updateItem(share.createdBy, itemId, patch);

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
      userId: share.createdBy,
      action: 'GUEST_UPDATE',
      status: 'success',
      ip,
      bottleId: itemId,
      details: { via: 'guest_share', shareId: share.id, inviteeName: share.inviteeName, changes: result.changes },
    });

    res.json({ data: result.item });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      void auditLog({
        userId: share.createdBy,
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
      userId: share.createdBy,
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
