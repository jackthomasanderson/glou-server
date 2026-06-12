import { z } from 'zod';

export const shareCreateSchema = z.object({
  label: z.string().max(100).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  hidePrices: z.boolean().default(false),
  hideNotes: z.boolean().default(false),
  cellarIds: z.array(z.string()).default([]),
  collectionIds: z.array(z.string()).default([]),
});

export type ShareCreateInput = z.infer<typeof shareCreateSchema>;
