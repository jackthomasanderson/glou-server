import { z } from 'zod';
import { CellarType } from '@prisma/client';

export const cellarBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  type: z.nativeEnum(CellarType).default('VINTAGE')
});

export const createCellarSchema = cellarBaseSchema;

export const updateCellarSchema = cellarBaseSchema.partial();

export type CreateCellarInput = z.infer<typeof createCellarSchema>;
export type UpdateCellarInput = z.infer<typeof updateCellarSchema>;
