import { z } from 'zod';
import { CORRECTION_REASONS, MAX_COPIES } from '../../../shared/product';

/** Copies one write may add, or that one group may count (same bound as `quantity`). */
export { MAX_COPIES };

/**
 * A price of one copy, as the `Decimal(12, 2)` column stores it: cents only
 * (12.345 would be stored 12.35 and never find its group again) and within
 * the column's range (a larger value fails the write).
 */
const unitPrice = z.number().min(0).multipleOf(0.01).max(9_999_999_999.99);

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
export const correctQuantitySchema = z.object({
  quantity: z.number().int().min(0).max(MAX_COPIES),
  reason: z.enum(CORRECTION_REASONS),
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
