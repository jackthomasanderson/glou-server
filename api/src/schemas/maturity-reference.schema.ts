import { z } from 'zod';

const maturityReferenceBase = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  mode: z.enum(['ABSOLUTE', 'RELATIVE']),
  windowFrom: z.number().int(),
  windowTo: z.number().int(),
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

export const maturityReferencePatchSchema = maturityReferenceBase.partial();

export type MaturityReferenceInput = z.infer<typeof maturityReferenceSchema>;
export type MaturityReferencePatch = z.infer<typeof maturityReferencePatchSchema>;

export const suggestQuerySchema = z.object({
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  region: z.string().optional(),
  color: z.string().optional(),
  producer: z.string().optional(),
  vintage: z.coerce.number().int().optional(),
});

export type SuggestQuery = z.infer<typeof suggestQuerySchema>;
