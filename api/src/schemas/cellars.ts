import { z } from "zod";

export const cellarTypeEnum = z.enum(["cellar", "showcase", "climate_cabinet", "rack", "other"]);

/** Cellar schema */
export const cellarSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  cellarType: cellarTypeEnum,
  locationDescription: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Cellar = z.infer<typeof cellarSchema>;

/** Input for creating a new cellar */
export const createCellarSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  cellarType: cellarTypeEnum,
  locationDescription: z.string().nullable().optional(),
});

export type CreateCellarInput = z.infer<typeof createCellarSchema>;

/** Input for updating a cellar */
export const updateCellarSchema = createCellarSchema.partial();

export type UpdateCellarInput = z.infer<typeof updateCellarSchema>;

/** Cellar with bottle count for display */
export const cellarWithStatsSchema = cellarSchema.extend({
  bottleCount: z.number().int().nonnegative().optional(),
});

export type CellarWithStats = z.infer<typeof cellarWithStatsSchema>;
