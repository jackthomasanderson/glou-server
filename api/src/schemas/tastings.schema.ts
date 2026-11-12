import { z } from 'zod';
import { categorySchema } from '../lib/category';
import { vintageSchema } from '../lib/years';

export const TASTING_READINESS_VALUES = ['TOO_YOUNG', 'PERFECT', 'PEAK', 'PAST'] as const;

/**
 * #471 (FEAT-107): a wine tasted elsewhere, by its name. It goes on the
 * family of the same wine (`productKey`: category, producer, name, vintage —
 * the vitola for a cigar) when Glou knows it; else Glou creates that wine,
 * without any bottle (FEAT-101).
 */
export const tastedWineSchema = z.object({
  category: categorySchema,
  name: z.string().trim().min(1).max(200),
  producer: z.string().trim().min(1).max(200),
  vintage: vintageSchema().optional().nullable(),
  // A cigar's vitola: what tells two cigars of a producer and name apart.
  format: z.string().trim().max(100).optional().nullable(),
});

export const tastingFields = {
  // A cleared date field sends '': no date, i.e. today on create and
  // unchanged on edit, instead of a 400 (#704).
  tastedAt: z.preprocess((v) => (v === '' ? undefined : v), z.string().date().optional()).optional(),
  context: z.string().max(200).optional(),
  // Nullable like `readiness`: the form sends `null` for "no stars", both
  // for a new tasting and to clear the rating of an existing one (#704).
  rating: z.number().int().min(1).max(5).optional().nullable(),
  readiness: z.enum(TASTING_READINESS_VALUES).optional().nullable(),
  notes: z.string().max(5000).optional(),
  foodPairing: z.string().max(500).optional(),
  photoUrl: z.string().url().optional().nullable(),
  // Structured wine tasting grid (data-model audit, Task 2, expert mode
  // only) — see schema.prisma TastingNote comment for why this lives here
  // rather than on InventoryItem.
  robe: z.string().max(500).optional().nullable(),
  nez: z.string().max(500).optional().nullable(),
  bouche: z.string().max(500).optional().nullable(),
  tanin: z.number().int().min(1).max(5).optional().nullable(),
  acidite: z.number().int().min(1).max(5).optional().nullable(),
  longueurBouche: z.number().int().min(0).max(600).optional().nullable(),
};

/**
 * #471 (FEAT-107): what was tasted — a bottle of the cellar (`itemId`, the
 * wine is that bottle's), a known wine without any bottle of the cellar
 * (`productId`: tasted elsewhere), or a wine named (`wine`). One of them at
 * most; `productId` may come with `itemId` when it is that bottle's wine.
 */
export const tastingCreateSchema = z.object({
  itemId: z.string().guid().optional(),
  productId: z.string().guid().optional(),
  wine: tastedWineSchema.optional(),
  ...tastingFields,
}).refine((data) => !(data.wine && (data.itemId || data.productId)), {
  message: 'A named wine cannot come with a bottle or a known wine',
  path: ['wine'],
});

/**
 * Editing a tasting: its fields, and the bottle of the same wine it was of
 * (moving a tasting to another wine is out of scope, FEAT-107).
 */
export const tastingPatchSchema = z.object({
  itemId: z.string().guid().optional(),
  ...tastingFields,
}).partial();

export type TastingCreateInput = z.infer<typeof tastingCreateSchema>;
export type TastingPatchInput = z.infer<typeof tastingPatchSchema>;
export type TastedWineInput = z.infer<typeof tastedWineSchema>;
