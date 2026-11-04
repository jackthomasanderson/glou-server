import { z } from 'zod';
import { bulkPatchSchema } from './inventory.schema';

export const bulkPresetSchema = z.object({
  id: z.string().guid().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  // #471 (D18, QP6): what a bulk edit may write — never a state.
  payload: bulkPatchSchema,
  userId: z.string().guid().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const bulkPresetCreateSchema = bulkPresetSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type BulkPreset = z.infer<typeof bulkPresetSchema>;
export type BulkPresetCreate = z.infer<typeof bulkPresetCreateSchema>;
