import { z } from 'zod';
import { CURVE_SHAPES } from '../lib/maturity-curve';
import { categorySchema } from '../lib/category';
import { ALERT_STATUSES, SPARKLING_TYPES, SUGAR_LEVELS, WINE_COLORS } from '../../../shared/inventory';

// ─── Common fields (all categories) ─────────────────────────────────────────

export const commonInventorySchema = z.object({
  category: categorySchema,
  name: z.string().min(1, 'Name is required').max(200),
  producer: z.string().min(1, 'Producer is required').max(200),
  location: z.string().max(200).optional(),
  collection: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  photoUrl: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  purchasePrice: z.number().min(0).optional(),
  purchasePlace: z.string().max(200).optional(),
  estimatedValue: z.number().min(0).optional(),
  // FEAT-87: false = non-owned reference. Defaults to owned, so the ordinary
  // "add a bottle" path and every existing client keep their behaviour.
  isOwned: z.boolean().default(true),
  isOpened: z.boolean().default(false),
  // #683: nullable like on the patch schema — the form sends null when the
  // item is marked as a reference (no level), and rejecting it blocked every add.
  fillLevel: z.number().int().min(0).max(100).optional().nullable(),
  openedAt: z.coerce.date().optional().nullable(),
  reminderDate: z.coerce.date().optional().nullable(),
  alertStatus: z.enum(ALERT_STATUSES).default('none'),
  // FEAT-86: consumption-curve shape for this bottle's drinking window.
  // null/omitted = inherit the LINEAR default. Wine/sparkling in practice,
  // but harmless (and simplest) to accept on the common schema.
  curveShape: z.enum(CURVE_SHAPES).optional().nullable(),
  cellarId: z.string().optional().nullable(),
  lockedFields: z.array(z.string()).default([]),
  // Collector/expert-mode fields (data-model audit, Tasks 2/3), available on
  // every category — not just their originally-assumed one. Appellation and
  // classification apply to protected-designation spirits too (Cognac AOC,
  // Scotch geographical indication...), and lot/batch/cask info is relevant
  // for barrel-aged wine or cigar box/production codes, not just spirits.
  // Free text throughout: jurisdictions and cask conventions are too varied
  // for a closed enum (same reasoning as `region` below). All optional and
  // blank by default — mode expert only decides whether the UI shows them.
  lotNumber: z.string().max(50).optional(),
  appellation: z.string().max(200).optional(),
  classification: z.string().max(200).optional(),
  caskType: z.string().max(100).optional(),
  // Nullable: the form sends null for a cleared date, which z.coerce.date()
  // alone turned into 1970-01-01 (#726).
  batchDate: z.coerce.date().optional().nullable(),
  isSingleCask: z.boolean().optional(),
  caskNumber: z.string().max(100).optional(),
  caskProof: z.number().min(0).max(100).optional(),
});

// ─── Peak window order ───────────────────────────────────────────────────────
// #706: a drinking window must not end before it starts — same rule as the
// maturity references (maturity-reference.schema.ts). A reversed window used
// to be stored as is and skewed the peak alerts.

type PeakWindow = { peakMaturityFrom?: number | null; peakMaturityTo?: number | null };
export const peakWindowInOrder = (d: PeakWindow) =>
  d.peakMaturityFrom == null || d.peakMaturityTo == null || d.peakMaturityTo >= d.peakMaturityFrom;
export const PEAK_WINDOW_ORDER = { message: 'peakMaturityTo must be >= peakMaturityFrom', path: ['peakMaturityTo'] };

/** The window an item ends up with once a patch is applied to it (see InventoryService.updateItem). */
export const peakWindowSchema = z
  .object({ peakMaturityFrom: z.number().nullish(), peakMaturityTo: z.number().nullish() })
  .refine(peakWindowInOrder, PEAK_WINDOW_ORDER);

// ─── Wine-specific schema ────────────────────────────────────────────────────

export const wineInventorySchema = commonInventorySchema.extend({
  category: z.literal('wine'),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  color: z.enum(WINE_COLORS).optional(),
  region: z.string().max(200).optional(),
  grapeVarieties: z.array(z.string().max(100)).max(10).default([]),
  alcoholDegree: z.number().min(0).max(100).optional(),
  bottleSize: z.string().max(50).optional(),
  peakMaturityFrom: z.number().int().min(1800).max(2200).optional().nullable(),
  peakMaturityTo: z.number().int().min(1800).max(2200).optional().nullable(),
  needsAeration: z.boolean().optional(),
  serviceTemp: z.string().max(50).optional(),
  // lotNumber/appellation/classification/cask fields moved to
  // commonInventorySchema (available on every category, see there).
}).refine(peakWindowInOrder, PEAK_WINDOW_ORDER);

// ─── Sparkling-specific schema ───────────────────────────────────────────────

export const sparklingInventorySchema = commonInventorySchema.extend({
  category: z.literal('sparkling'),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  sparklingType: z.enum(SPARKLING_TYPES).optional(),
  sugarLevel: z.enum(SUGAR_LEVELS).optional(),
  // Nullable, see batchDate (#726).
  disgorgingDate: z.coerce.date().optional().nullable(),
  baseYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  peakMaturityFrom: z.number().int().min(1800).max(2200).optional().nullable(),
  peakMaturityTo: z.number().int().min(1800).max(2200).optional().nullable(),
  serviceTemp: z.string().max(50).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
  bottleSize: z.string().max(50).optional(),
}).refine(peakWindowInOrder, PEAK_WINDOW_ORDER);

// ─── Spirit-specific schema ──────────────────────────────────────────────────

export const spiritInventorySchema = commonInventorySchema.extend({
  category: z.literal('spirit'),
  spiritType: z.string().max(50).optional(),
  edition: z.string().max(200).optional(),
  alcoholDegree: z.number().min(0).max(100),
  declaredAge: z.number().int().min(0).max(200).optional(),
  additions: z.string().max(500).optional(),
  aromaticProfile: z.string().max(500).optional(),
  bottleSize: z.string().max(50).optional(),
  // lotNumber/caskType/batchDate/isSingleCask/caskNumber/caskProof moved to
  // commonInventorySchema (available on every category, see there).
});

// ─── Cigar-specific schema ───────────────────────────────────────────────────

export const cigarInventorySchema = commonInventorySchema.extend({
  category: z.literal('cigar'),
  format: z.string().max(100).optional(),
  // ISSUE_101/ISSUE_029: min(0), not min(1) — a cigar box the owner has
  // smoked through entirely is a real, representable state, not a forbidden one.
  quantity: z.number().int().min(0).max(1000),
  manufactureYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  leafOrigin: z.string().max(200).optional(),
  factoryCode: z.string().max(50).optional(),
  recommendedHumidity: z.number().min(50).max(100).optional(),
  humidificationSystem: z.string().max(200).optional(),
});

// ─── Discriminated union ─────────────────────────────────────────────────────

export const inventoryInputSchema = z.discriminatedUnion('category', [
  wineInventorySchema,
  sparklingInventorySchema,
  spiritInventorySchema,
  cigarInventorySchema,
]);

export type InventoryInput = z.infer<typeof inventoryInputSchema>;
export type InventoryCategory = InventoryInput['category'];

// ─── Patch schema ────────────────────────────────────────────────────────────
// Uses a flat partial object instead of discriminatedUnion.partial() which is not
// supported by Zod's type system for discriminated unions.

/** The patch fields, before the cross-field window check (#471: the family patch picks its own). */
export const inventoryPatchObject = z.object({
  category: categorySchema.optional(),
  name: z.string().min(1).max(200).optional(),
  producer: z.string().min(1).max(200).optional(),
  location: z.string().max(200).optional().nullable(),
  collection: z.string().max(200).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  photoUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  purchasePrice: z.number().min(0).optional().nullable(),
  purchasePlace: z.string().max(200).optional().nullable(),
  // #471 (D6): the purchase day of a line ("Modifier" in the drawer), a day
  // `YYYY-MM-DD` stored at midnight UTC — never read through a local time zone.
  purchasedAt: z.iso.date().nullable()
    .transform((day) => (day === null ? null : new Date(`${day}T00:00:00.000Z`)))
    .optional(),
  estimatedValue: z.number().min(0).optional().nullable(),
  // FEAT-87: flipping this is how a reference gets stocked (and how a
  // mistakenly-stocked item goes back to being a reference).
  isOwned: z.boolean().optional(),
  isOpened: z.boolean().optional(),
  fillLevel: z.number().int().min(0).max(100).optional().nullable(),
  openedAt: z.coerce.date().optional().nullable(),
  // #471 (FEAT-103): cigars left in an opened box (null = closed and complete).
  cigarsLeft: z.number().int().min(0).max(1000).optional().nullable(),
  // #471 (FEAT-103): smoke one cigar of this unit — the first one of a closed
  // box opens it (M−1 left), a single cigar is finished (stock-state.service.ts).
  smokeOne: z.literal(true).optional(),
  // #471 (FEAT-106): a sub-record put back intact goes back into its group;
  // if tastings were noted on it, the answer to "keep them?" (on the family)
  // — without it, 409 TASTINGS_ON_ITEM.
  keepTastings: z.boolean().optional(),
  reminderDate: z.coerce.date().optional().nullable(),
  alertStatus: z.enum(ALERT_STATUSES).optional().nullable(),
  alertsPaused: z.boolean().optional(),
  // ISSUE_031: `lockedFields` is an internal bookkeeping field written only
  // by `InventoryService.updateItem` itself — the client has no legitimate
  // reason to set it directly, and the detail form used to round-trip it
  // unchanged on every save, which silently disabled the auto-lock that a
  // plain field edit is supposed to trigger (see InventoryForm.tsx).
  // Wine/Sparkling
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional().nullable(),
  color: z.enum(WINE_COLORS).optional().nullable(),
  region: z.string().max(200).optional().nullable(),
  grapeVarieties: z.array(z.string().max(100)).max(10).optional(),
  alcoholDegree: z.number().min(0).max(100).optional().nullable(),
  bottleSize: z.string().max(50).optional().nullable(),
  peakMaturityFrom: z.number().int().min(1800).max(2200).optional().nullable(),
  peakMaturityTo: z.number().int().min(1800).max(2200).optional().nullable(),
  curveShape: z.enum(CURVE_SHAPES).optional().nullable(),
  needsAeration: z.boolean().optional().nullable(),
  serviceTemp: z.string().max(50).optional().nullable(),
  lotNumber: z.string().max(50).optional().nullable(),
  sparklingType: z.enum(SPARKLING_TYPES).optional().nullable(),
  sugarLevel: z.enum(SUGAR_LEVELS).optional().nullable(),
  disgorgingDate: z.coerce.date().optional().nullable(),
  baseYear: z.number().int().optional().nullable(),
  // Wine collector fields (Task 2, expert mode only)
  appellation: z.string().max(200).optional().nullable(),
  classification: z.string().max(200).optional().nullable(),
  // Spirit
  spiritType: z.string().max(50).optional().nullable(),
  edition: z.string().max(200).optional().nullable(),
  declaredAge: z.number().int().min(0).max(200).optional().nullable(),
  caskType: z.string().max(100).optional().nullable(),
  additions: z.string().max(500).optional().nullable(),
  aromaticProfile: z.string().max(500).optional().nullable(),
  // Spirit cask/batch collector fields (Task 3, expert mode only)
  batchDate: z.coerce.date().optional().nullable(),
  isSingleCask: z.boolean().optional().nullable(),
  caskNumber: z.string().max(100).optional().nullable(),
  caskProof: z.number().min(0).max(100).optional().nullable(),
  // Cigar
  format: z.string().max(100).optional().nullable(),
  // ISSUE_101/ISSUE_029: min(0) — see cigarInventorySchema's quantity field above.
  quantity: z.number().int().min(0).max(1000).optional().nullable(),
  // #471 (FEAT-95): cigars per box of a group of closed boxes (null = single cigars).
  cigarsPerBox: z.number().int().min(1).max(1000).optional().nullable(),
  manufactureYear: z.number().int().optional().nullable(),
  leafOrigin: z.string().max(200).optional().nullable(),
  factoryCode: z.string().max(50).optional().nullable(),
  recommendedHumidity: z.number().min(50).max(100).optional().nullable(),
  humidificationSystem: z.string().max(200).optional().nullable(),
  cellarId: z.preprocess(v => (v === 'none' || v === '') ? null : v, z.string().optional().nullable()),
  // Grid slot assignment (FEAT-68)
  slotColumn: z.number().int().min(1).max(100).optional().nullable(),
  slotRow: z.number().int().min(1).max(100).optional().nullable(),
  // ─── Offline sync optimistic concurrency (FEAT-16/23) ──────────────────────
  // Set by the web app's offline sync queue and bottle edit form (#572): the
  // `updatedAt` of the item AS KNOWN when the change was made. Opt-in — if
  // omitted, `InventoryService.updateItem` applies the patch unconditionally
  // exactly like before this field existed (last-write-wins, unchanged
  // behavior for every caller that doesn't send it).
  expectedUpdatedAt: z.string().datetime().optional(),
  // Both years in one patch (what the bottle form sends). A patch carrying
  // only one is checked against the stored other one in updateItem.
});

export const inventoryPatchSchema = inventoryPatchObject.refine(peakWindowInOrder, PEAK_WINDOW_ORDER);

export type InventoryPatch = z.infer<typeof inventoryPatchSchema>;

// ISSUE_052: `ids` used to be cast `as string[]` with no content check and
// no length cap — bounded only by the 2MB request body limit, i.e. tens of
// thousands of ids could reach a single `updateMany`.
export const bulkUpdateSchema = z.object({
  ids: z.array(z.string().guid()).min(1).max(500),
  patch: inventoryPatchSchema,
});

export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;

// ─── Guest-restricted update schema (FEAT-37) ────────────────────────────────
// Guests with write access on a cellar (via GuestShare.writeCellarIds) may only
// touch consumption/service state — never pricing, structural, or category fields.
// #471 (FEAT-109): nor the notes, which belong to the family and so to every
// bottle of the wine. `.strict()` rejects any unexpected key outright (defense in depth).

export const guestInventoryUpdateSchema = z
  .object({
    isOpened: z.boolean().optional(),
    openedAt: z.coerce.date().optional().nullable(),
    fillLevel: z.number().int().min(0).max(100).optional().nullable(),
  })
  .strict();

export type GuestInventoryUpdate = z.infer<typeof guestInventoryUpdateSchema>;

// ─── Field rollback (FEAT-05) ────────────────────────────────────────────────
// Restores a single field to a value already present in the item's real
// audit history (see InventoryService.rollbackField, which re-validates
// `toValue` server-side against the tracked history — this schema only
// checks shape).

export const rollbackFieldSchema = z.object({
  field: z.string().min(1).max(100),
  toValue: z.unknown(),
});

export type RollbackFieldInput = z.infer<typeof rollbackFieldSchema>;
