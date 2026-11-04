import { z } from 'zod';
import { TASTING_READINESS_VALUES } from './tastings.schema';

/**
 * #471 (FEAT-109 c3, D16): a tasting a guest notes on a wine of a cellar
 * shared with write access. `.strict()`: the wine and, optionally, the bottle
 * tasted, and what a tasting says — nothing else (no photo URL, no author).
 * Same bounds as a member's tasting (tastings.schema.ts).
 */
export const guestTastingSchema = z
  .object({
    productId: z.string().guid(),
    itemId: z.string().guid().optional(),
    tastedAt: z.preprocess((v) => (v === '' ? undefined : v), z.string().date().optional()).optional(),
    rating: z.number().int().min(1).max(5).optional().nullable(),
    readiness: z.enum(TASTING_READINESS_VALUES).optional().nullable(),
    notes: z.string().max(5000).optional(),
    foodPairing: z.string().max(500).optional(),
  })
  .strict();

export type GuestTastingInput = z.infer<typeof guestTastingSchema>;
