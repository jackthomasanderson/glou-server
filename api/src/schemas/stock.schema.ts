import { z } from 'zod';
import { CORRECTION_REASONS, MAX_BULK_WINES, MAX_COPIES } from '../../../shared/product';

/** Copies one write may add, or that one group may count (same bound as `quantity`). */
export { MAX_COPIES };

/**
 * A price of one copy, as the `Decimal(12, 2)` column stores it: cents only
 * (12.345 would be stored 12.35 and never find its group again) and within
 * the column's range (a larger value fails the write).
 */
export const unitPrice = z.number().min(0).multipleOf(0.01).max(9_999_999_999.99);

/**
 * #471 (FEAT-92 c1-c2, FEAT-95, FEAT-101 c3): POST /api/products/:id/items —
 * "Ajouter des bouteilles" to a known family: only what tells a group apart
 * (D5) and the number, never the description. Prices are those of ONE copy
 * (bottle, box, single cigar). `cigarsPerBox`: a cigar group of closed boxes;
 * absent or null, single cigars (bottles never carry it). `purchasedAt` is a
 * day, `YYYY-MM-DD` (D6), today in the API's time zone when absent.
 */
export const addUnitsSchema = z.object({
  quantity: z.number().int().min(1).max(MAX_COPIES),
  cellarId: z.preprocess((v) => (v === 'none' || v === '' ? null : v), z.string().max(100).nullable().optional()),
  purchasePrice: unitPrice.nullable().optional(),
  bottleSize: z.string().max(50).nullable().optional(),
  cigarsPerBox: z.number().int().min(1).max(MAX_COPIES).nullable().optional(),
  purchasedAt: z.iso.date().nullable().optional(),
}).strict();

export type AddUnitsInput = z.infer<typeof addUnitsSchema>;

/**
 * #471 (FEAT-92 c3, FEAT-95 c4): POST /api/inventory/:id/correct — the new
 * number of a group and why it went down (decision #471, point 34).
 * `expectedUpdatedAt`: the group's `updatedAt` as the client knew it (the
 * offline queue replays a correction, point 47).
 */
/**
 * FEAT-93 (lot S2, criterion 4): the cells of the copies leaving a line —
 * freed by a correction, a write-off or a move, following the copies
 * repriced — when the copies left cannot hold every cell (else 409
 * SLOTS_TO_FREE_REQUIRED). Each slot once, checked against the line by the service.
 */
const slotIds = z.array(z.string().guid()).max(MAX_COPIES).optional();

export const correctQuantitySchema = z.object({
  quantity: z.number().int().min(0).max(MAX_COPIES),
  reason: z.enum(CORRECTION_REASONS),
  slotIds,
  expectedUpdatedAt: z.string().datetime().optional(),
}).strict();

export type CorrectQuantityInput = z.infer<typeof correctQuantitySchema>;

/**
 * #471 (FEAT-98, decision points 12 and 53): how many copies of a group the
 * move or the new price is for — from 1 to the group's number (checked
 * against the group itself by the service). `expectedUpdatedAt`: the group's
 * `updatedAt` as the client knew it, a dialog left open meanwhile is answered
 * 409.
 */
const splitCount = {
  count: z.number().int().min(1).max(MAX_COPIES),
  slotIds,
  expectedUpdatedAt: z.string().datetime().optional(),
};

/** POST /api/inventory/:id/move — "Déplacer": `count` copies to `cellarId` (null: no cellar). */
export const moveUnitsSchema = z.object({
  ...splitCount,
  cellarId: z.preprocess((v) => (v === 'none' || v === '' ? null : v), z.string().max(100).nullable()),
}).strict();

export type MoveUnitsInput = z.infer<typeof moveUnitsSchema>;

/** POST /api/inventory/:id/reprice — "Changer le prix": the price of ONE copy for `count` copies (null: no price). */
export const repriceUnitsSchema = z.object({
  ...splitCount,
  purchasePrice: unitPrice.nullable(),
}).strict();

export type RepriceUnitsInput = z.infer<typeof repriceUnitsSchema>;

/**
 * #471 (FEAT-111, D18): the wines a bulk action applies to — each one once
 * (a wine twice would be counted twice in the answer).
 */
const bulkWines = z.array(z.string().guid()).min(1).max(MAX_BULK_WINES)
  .refine((ids) => new Set(ids).size === ids.length, 'Each wine once');

/** POST /api/products/bulk-move — every bottle in the cellar of these wines to `cellarId` (null: no cellar). */
export const bulkMoveSchema = z.object({
  productIds: bulkWines,
  cellarId: z.preprocess((v) => (v === 'none' || v === '' ? null : v), z.string().max(100).nullable()),
}).strict();

export type BulkMoveInput = z.infer<typeof bulkMoveSchema>;

/** POST /api/products/bulk-trash — every bottle in the cellar of these wines to the trash. */
export const bulkTrashSchema = z.object({ productIds: bulkWines }).strict();

export type BulkTrashInput = z.infer<typeof bulkTrashSchema>;

/**
 * POST /api/products/bulk-drink — "Marquer comme bus" (decision #471, point
 * 42): how many bottles (cigars) of each wine were drunk (smoked).
 * `openedFirst` (default true): an opened bottle (box) of the wine is
 * finished first (ux-ui.md §10.4.8). `cellarIds`: the cellars being looked
 * at, whose line is taken first (FEAT-104). At most {@link MAX_COPIES}
 * bottles (cigars) in all.
 */
export const bulkDrinkSchema = z.object({
  items: z.array(z.object({
    productId: z.string().guid(),
    count: z.number().int().min(1).max(MAX_COPIES),
    openedFirst: z.boolean().optional(),
  }).strict()).min(1).max(MAX_BULK_WINES)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length, 'Each wine once')
    // Each bottle is finished on its own (detach rule), inside one transaction
    // holding every family's lock: the whole action stays within MAX_COPIES.
    .refine((items) => items.reduce((sum, item) => sum + item.count, 0) <= MAX_COPIES, 'TOO_MANY_AT_ONCE'),
  cellarIds: z.array(z.string().max(100)).max(100).optional(),
}).strict();

export type BulkDrinkInput = z.infer<typeof bulkDrinkSchema>;
