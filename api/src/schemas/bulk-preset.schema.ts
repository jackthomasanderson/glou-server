import { z } from 'zod';
import { inventoryPatchSchema } from './inventory.schema';

export const bulkPresetSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  payload: inventoryPatchSchema,
  userId: z.string().uuid().optional(),
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
