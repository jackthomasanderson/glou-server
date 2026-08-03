import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';
import {
  listWishlist,
  getWishlistItem,
  createWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  recordPriceSeen,
  convertToInventory,
} from '../services/wishlist.service';
import {
  listBudgetEnvelopes,
  createBudgetEnvelope,
  updateBudgetEnvelope,
  deleteBudgetEnvelope,
  getBudgetProgress,
} from '../services/budget.service';
import {
  wishlistCreateSchema,
  wishlistPatchSchema,
  priceSeenSchema,
  convertToInventorySchema,
} from '../schemas/wishlist.schema';
import { budgetEnvelopeCreateSchema, budgetEnvelopePatchSchema } from '../schemas/budget.schema';

// FEAT-20: Liste de Souhaits & Pilotage Budgétaire — every route below is
// scoped to req.userId (personal by design, see wishlist.service.ts /
// budget.service.ts header comments). Never treat this router as a template
// for inventory routes, which must stay unfiltered by userId.

const router = Router();
router.use(authMiddleware);

function handleZodError(res: Response, error: unknown): boolean {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
    return true;
  }
  return false;
}

// ─── Wishlist items ───────────────────────────────────────────────────────────

router.get('/items', async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    const items = await listWishlist(userId);
    res.json({ data: items });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_WISHLIST' });
  }
});

router.get('/items/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    const item = await getWishlistItem(userId, req.params.id);
    if (!item) return res.status(404).json({ error: 'WISHLIST_ITEM_NOT_FOUND' });
    res.json({ data: item });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_WISHLIST_ITEM' });
  }
});

router.post('/items', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const ip = getClientIp(req);
  try {
    const input = wishlistCreateSchema.parse(req.body);
    const item = await createWishlistItem(userId, input);
    void auditLog({ userId, ip, action: 'CREATE', status: 'success', details: { scope: 'wishlist-item', id: item.id } });
    res.status(201).json({ data: item });
  } catch (error) {
    if (handleZodError(res, error)) return;
    void auditLog({ userId, ip, action: 'CREATE', status: 'error', details: { scope: 'wishlist-item', message: String(error) } });
    res.status(500).json({ error: 'FAILED_TO_CREATE_WISHLIST_ITEM' });
  }
});

router.patch('/items/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const ip = getClientIp(req);
  try {
    const input = wishlistPatchSchema.parse(req.body);
    const item = await updateWishlistItem(userId, req.params.id, input);
    if (!item) return res.status(404).json({ error: 'WISHLIST_ITEM_NOT_FOUND' });
    void auditLog({ userId, ip, action: 'UPDATE', status: 'success', details: { scope: 'wishlist-item', id: item.id } });
    res.json({ data: item });
  } catch (error) {
    if (handleZodError(res, error)) return;
    void auditLog({ userId, ip, action: 'UPDATE', status: 'error', details: { scope: 'wishlist-item', message: String(error) } });
    res.status(500).json({ error: 'FAILED_TO_UPDATE_WISHLIST_ITEM' });
  }
});

router.delete('/items/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const ip = getClientIp(req);
  try {
    const deleted = await deleteWishlistItem(userId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'WISHLIST_ITEM_NOT_FOUND' });
    void auditLog({ userId, ip, action: 'DELETE', status: 'success', details: { scope: 'wishlist-item', id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'FAILED_TO_DELETE_WISHLIST_ITEM' });
  }
});

// ─── PATCH /items/:id/price-seen — manual price entry, see wishlist.service.ts

router.patch('/items/:id/price-seen', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const ip = getClientIp(req);
  try {
    const { price } = priceSeenSchema.parse(req.body);
    const item = await recordPriceSeen(userId, req.params.id, price);
    if (!item) return res.status(404).json({ error: 'WISHLIST_ITEM_NOT_FOUND' });
    void auditLog({ userId, ip, action: 'UPDATE', status: 'success', details: { scope: 'wishlist-price-seen', id: item.id, price } });
    res.json({ data: item });
  } catch (error) {
    if (handleZodError(res, error)) return;
    void auditLog({ userId, ip, action: 'UPDATE', status: 'error', details: { scope: 'wishlist-price-seen', message: String(error) } });
    res.status(500).json({ error: 'FAILED_TO_RECORD_PRICE' });
  }
});

// ─── POST /items/:id/convert — bascule souhait → inventaire ──────────────────

router.post('/items/:id/convert', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const ip = getClientIp(req);
  try {
    const input = convertToInventorySchema.parse(req.body ?? {});
    const result = await convertToInventory(userId, req.params.id, input);
    if (!result) return res.status(404).json({ error: 'WISHLIST_ITEM_NOT_FOUND_OR_NOT_ACTIVE' });
    void auditLog({
      userId, ip, action: 'CREATE', status: 'success',
      bottleId: result.inventoryItem.id,
      details: { scope: 'wishlist-convert', wishlistItemId: result.wishlistItem.id },
    });
    res.status(201).json({ data: result });
  } catch (error) {
    if (handleZodError(res, error)) return;
    void auditLog({ userId, ip, action: 'CREATE', status: 'error', details: { scope: 'wishlist-convert', message: String(error) } });
    res.status(500).json({ error: 'FAILED_TO_CONVERT_WISHLIST_ITEM' });
  }
});

// ─── Budget envelopes ─────────────────────────────────────────────────────────

router.get('/budget-envelopes', async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    const envelopes = await listBudgetEnvelopes(userId);
    res.json({ data: envelopes });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_BUDGET_ENVELOPES' });
  }
});

router.post('/budget-envelopes', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const ip = getClientIp(req);
  try {
    const input = budgetEnvelopeCreateSchema.parse(req.body);
    const envelope = await createBudgetEnvelope(userId, input);
    void auditLog({ userId, ip, action: 'CREATE', status: 'success', details: { scope: 'budget-envelope', id: envelope.id } });
    res.status(201).json({ data: envelope });
  } catch (error) {
    if (handleZodError(res, error)) return;
    void auditLog({ userId, ip, action: 'CREATE', status: 'error', details: { scope: 'budget-envelope', message: String(error) } });
    res.status(500).json({ error: 'FAILED_TO_CREATE_BUDGET_ENVELOPE' });
  }
});

router.patch('/budget-envelopes/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const ip = getClientIp(req);
  try {
    const input = budgetEnvelopePatchSchema.parse(req.body);
    const envelope = await updateBudgetEnvelope(userId, req.params.id, input);
    if (!envelope) return res.status(404).json({ error: 'BUDGET_ENVELOPE_NOT_FOUND' });
    void auditLog({ userId, ip, action: 'UPDATE', status: 'success', details: { scope: 'budget-envelope', id: envelope.id } });
    res.json({ data: envelope });
  } catch (error) {
    if (handleZodError(res, error)) return;
    void auditLog({ userId, ip, action: 'UPDATE', status: 'error', details: { scope: 'budget-envelope', message: String(error) } });
    res.status(500).json({ error: 'FAILED_TO_UPDATE_BUDGET_ENVELOPE' });
  }
});

router.delete('/budget-envelopes/:id', async (req: Request, res: Response) => {
  const userId = req.userId!;
  const ip = getClientIp(req);
  try {
    const deleted = await deleteBudgetEnvelope(userId, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'BUDGET_ENVELOPE_NOT_FOUND' });
    void auditLog({ userId, ip, action: 'DELETE', status: 'success', details: { scope: 'budget-envelope', id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'FAILED_TO_DELETE_BUDGET_ENVELOPE' });
  }
});

router.get('/budget-envelopes/:id/progress', async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    const progress = await getBudgetProgress(userId, req.params.id);
    if (!progress) return res.status(404).json({ error: 'BUDGET_ENVELOPE_NOT_FOUND' });
    res.json({ data: progress });
  } catch {
    res.status(500).json({ error: 'FAILED_TO_FETCH_BUDGET_PROGRESS' });
  }
});

export default router;
