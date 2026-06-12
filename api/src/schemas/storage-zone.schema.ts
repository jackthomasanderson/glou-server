import { z } from 'zod';

export const createStorageZoneSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  capacity: z.number().int().min(1).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

export const updateStorageZoneSchema = createStorageZoneSchema.partial();

export type CreateStorageZoneInput = z.infer<typeof createStorageZoneSchema>;
export type UpdateStorageZoneInput = z.infer<typeof updateStorageZoneSchema>;
