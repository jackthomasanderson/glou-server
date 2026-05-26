import { z } from 'zod';

export const collectionCreateSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  icon: z.string().max(50).optional(),
});

export const collectionPatchSchema = collectionCreateSchema.partial();

export const collectionItemsSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});

export type CollectionCreateInput = z.infer<typeof collectionCreateSchema>;
export type CollectionPatchInput = z.infer<typeof collectionPatchSchema>;
export type CollectionItemsInput = z.infer<typeof collectionItemsSchema>;
