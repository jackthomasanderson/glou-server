import { z } from 'zod';
import { CURVE_SHAPES } from '../lib/maturity-curve';
import { categorySchema } from '../lib/category';

const maturityReferenceBase = z.object({
  name: z.string().min(1).max(200),
  category: categorySchema,
  mode: z.enum(['ABSOLUTE', 'RELATIVE']),
  windowFrom: z.number().int(),
  windowTo: z.number().int(),
  // FEAT-86: curve shape + explicit cascade priority. Both have a safe
  // default so pre-FEAT-86 clients that omit them keep working.
  curveShape: z.enum(CURVE_SHAPES).default('LINEAR'),
  priority: z.number().int().min(0).max(100_000).default(0),
  region: z.string().max(200).optional().nullable(),
  color: z.string().max(100).optional().nullable(),
  producer: z.string().max(200).optional().nullable(),
  vintageFrom: z.number().int().min(1800).max(2200).optional().nullable(),
  vintageTo: z.number().int().min(1800).max(2200).optional().nullable(),
});

export const maturityReferenceSchema = maturityReferenceBase.refine(
  (d) => d.windowTo >= d.windowFrom,
  { message: 'windowTo must be >= windowFrom', path: ['windowTo'] },
);

// zod 4 applies a field's .default() even under .partial(): a PATCH that
// omits `curveShape` or `priority` must leave them unchanged, not reset them.
export const maturityReferencePatchSchema = maturityReferenceBase.partial().extend({
  curveShape: maturityReferenceBase.shape.curveShape.unwrap().optional(),
  priority: maturityReferenceBase.shape.priority.unwrap().optional(),
});

export type MaturityReferenceInput = z.infer<typeof maturityReferenceSchema>;
export type MaturityReferencePatch = z.infer<typeof maturityReferencePatchSchema>;

// FEAT-86: reorder the whole cascade in one call. `ids` is the references in
// their new top-to-bottom order (first = highest priority).
export const maturityReferenceReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

export type MaturityReferenceReorder = z.infer<typeof maturityReferenceReorderSchema>;

export const suggestQuerySchema = z.object({
  category: categorySchema,
  region: z.string().optional(),
  color: z.string().optional(),
  producer: z.string().optional(),
  vintage: z.coerce.number().int().optional(),
});

export type SuggestQuery = z.infer<typeof suggestQuerySchema>;
