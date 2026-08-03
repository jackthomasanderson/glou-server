import { z } from 'zod';

export const shareCreateSchema = z
  .object({
    label: z.string().max(100).optional(),
    // Display name of the invited person (FEAT-37) — distinct from `label`, purely informational.
    inviteeName: z.string().max(100).optional(),
    expiresAt: z.string().datetime().optional().nullable(),
    hidePrices: z.boolean().default(false),
    hideNotes: z.boolean().default(false),
    cellarIds: z.array(z.string()).default([]),
    collectionIds: z.array(z.string()).default([]),
    // Subset of cellarIds granted read/write access (FEAT-37).
    writeCellarIds: z.array(z.string()).default([]),
  })
  .refine((data) => data.writeCellarIds.every((id) => data.cellarIds.includes(id)), {
    message: 'writeCellarIds must be a subset of cellarIds',
    path: ['writeCellarIds'],
  });

export type ShareCreateInput = z.infer<typeof shareCreateSchema>;
