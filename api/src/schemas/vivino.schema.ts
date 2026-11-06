import { z } from 'zod';
import { SUGAR_LEVELS, WINE_COLORS } from '../../../shared/inventory';

// ─── Vivino lookup (GET /api/vivino/lookup) ──────────────────────────────────
// Query-string fields, named and bounded like the item's own (inventory.schema.ts),
// so a client can pass an item, or a form being filled in, as it stands.

/** An empty query value (`?vintage=`) means "not given", like an absent one. */
const blankAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const optionalText = z.preprocess(blankAsUndefined, z.string().trim().max(200).optional()).optional();

export const vivinoLookupQuerySchema = z.object({
  // Vivino lists wines only: a spirit or a cigar is refused here rather than mismatched there.
  category: z.preprocess(blankAsUndefined, z.enum(['wine', 'sparkling']).optional()).optional(),
  producer: z.string().trim().min(1).max(200),
  name: optionalText,
  vintage: z.preprocess(
    blankAsUndefined,
    z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional(),
  ).optional(),
  color: z.preprocess(blankAsUndefined, z.enum(WINE_COLORS).optional()).optional(),
  region: optionalText,
  appellation: optionalText,
  sugarLevel: z.preprocess(blankAsUndefined, z.enum(SUGAR_LEVELS).optional()).optional(),
});

export type VivinoLookupQuery = z.infer<typeof vivinoLookupQuerySchema>;
