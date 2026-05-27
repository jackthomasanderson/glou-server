import { z } from 'zod';

export const tastingCreateSchema = z.object({
  itemId: z.string().uuid().optional(),
  tastedAt: z.string().date().optional(),
  context: z.string().max(200).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(5000).optional(),
  foodPairing: z.string().max(500).optional(),
  photoUrl: z.string().url().optional().nullable(),
});

export const tastingPatchSchema = tastingCreateSchema.partial();

export type TastingCreateInput = z.infer<typeof tastingCreateSchema>;
export type TastingPatchInput = z.infer<typeof tastingPatchSchema>;
