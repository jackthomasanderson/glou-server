import { z } from 'zod';
import { categorySchema } from '../lib/category';
import { CORRECTION_REASONS } from '../../../shared/product';
import { MAX_COPIES } from './stock.schema';

// ─── POST /inventory-count/sessions ──────────────────────────────────────────

export const startSessionSchema = z.object({
  scopeLabel: z.string().min(1, 'scopeLabel is required').max(120),
  cellarId: z.string().min(1).optional().nullable(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;

// ─── POST /inventory-count/sessions/:id/scan ─────────────────────────────────

// #471 (FEAT-100): `foundQuantity` answers "Combien en avez-vous trouvé ?"
// for a group; absent, the whole line was found (a single bottle, an opened
// one, or a group confirmed in one tap).
export const scanSchema = z.object({
  itemId: z.string().min(1, 'itemId is required'),
  foundQuantity: z.number().int().min(0).max(MAX_COPIES).optional(),
});

export type ScanInput = z.infer<typeof scanSchema>;

// ─── POST /inventory-count/sessions/:id/complete ─────────────────────────────

// 'add_to_stock' targets an InventoryCountEntry that has no itemId yet (a
// physical find with no match in the system, see recordFoundItemSchema
// below) — it references `entryId`, not `itemId`; `productId` attaches the
// find to a wine already known (#471, FEAT-100), absent it is a new wine.
// The other actions target a real InventoryItem via `itemId`.
// #471 (FEAT-100): a group is corrected for its missing (or surplus) copies
// only. `count` is that number of copies; absent, the server takes the
// difference between the expected number and the one found.
// - mark_consumed: the missing copies were drunk (each one detached and
//   finished, FEAT-103);
// - correct_quantity: "Corriger le nombre" with its reason (FEAT-92);
// - add_units: the copies found in excess complete the group.
const copies = z.number().int().min(1).max(MAX_COPIES).optional();

export const correctionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_consumed'), itemId: z.string().min(1), count: copies }),
  z.object({
    action: z.literal('correct_quantity'),
    itemId: z.string().min(1),
    reason: z.enum(CORRECTION_REASONS),
    count: copies,
  }),
  z.object({ action: z.literal('add_units'), itemId: z.string().min(1), count: copies }),
  z.object({ action: z.literal('move_to_scope'), itemId: z.string().min(1) }),
  z.object({ action: z.literal('add_to_stock'), entryId: z.string().min(1), productId: z.string().min(1).max(100).optional() }),
]);

export const completeSessionSchema = z.object({
  corrections: z.array(correctionSchema).max(500).optional().default([]),
});

export type CorrectionInput = z.infer<typeof correctionSchema>;
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

// ─── POST /inventory-count/sessions/:id/found ─────────────────────────────────
// Records a physical find that matches NO existing InventoryItem — the
// "ajouter au stock" corrective action from feature.md (FEAT-12). Category
// reuses the same closed set as the regular inventory input schema;
// quantity is the number of copies found (#471, FEAT-100: a find of six
// bottles becomes a group ×6), one when absent.

export const recordFoundItemSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  category: categorySchema,
  quantity: z.number().int().min(1).max(1000).optional(),
});

export type RecordFoundItemInput = z.infer<typeof recordFoundItemSchema>;
