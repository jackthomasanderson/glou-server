import { z } from 'zod';
import { tastingFields } from './tastings.schema';

/**
 * #471 (FEAT-109 c3, D16): a tasting a guest notes on a wine of a cellar
 * shared with write access. `.strict()`: the wine and, optionally, the bottle
 * tasted, and what a tasting says — nothing else (no photo URL, no author).
 * Same fields and bounds as a member's tasting (`tastingFields`).
 */
export const guestTastingSchema = z
  .object({
    productId: z.string().guid(),
    itemId: z.string().guid().optional(),
    tastedAt: tastingFields.tastedAt,
    rating: tastingFields.rating,
    readiness: tastingFields.readiness,
    notes: tastingFields.notes,
    foodPairing: tastingFields.foodPairing,
  })
  .strict();

export type GuestTastingInput = z.infer<typeof guestTastingSchema>;
