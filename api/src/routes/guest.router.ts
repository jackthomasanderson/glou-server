import { Router, Request, Response } from 'express';
import { guestMiddleware } from '../middleware/guest.middleware';
import { sharesService } from '../services/shares.service';

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

export default router;
