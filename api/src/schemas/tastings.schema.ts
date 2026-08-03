import { z } from 'zod';

export const TASTING_READINESS_VALUES = ['TOO_YOUNG', 'PERFECT', 'PEAK', 'PAST'] as const;

export const tastingCreateSchema = z.object({
  itemId: z.string().uuid().optional(),
  tastedAt: z.string().date().optional(),
  context: z.string().max(200).optional(),
  rating: z.number().int().min(1).max(5).optional(),
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
});

export const tastingPatchSchema = tastingCreateSchema.partial();

export type TastingCreateInput = z.infer<typeof tastingCreateSchema>;
export type TastingPatchInput = z.infer<typeof tastingPatchSchema>;
