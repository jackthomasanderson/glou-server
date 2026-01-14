import { z } from "zod";

export const cellarTypeEnum = z.enum(["aging", "service", "multizone", "combined", "hybrid", "cigar", "natural", "other"]);

/** Cellar schema */
const baseCellarInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  cellarType: cellarTypeEnum,
  locationDescription: z.string().nullable().optional(),
  placement: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  bottleCapacity: z.number().int().nonnegative().nullable().optional(),
  shelfCount: z.number().int().nonnegative().nullable().optional(),
});

/** Cellar schema */
export const cellarSchema = baseCellarInput.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Cellar = z.infer<typeof cellarSchema>;

/** Input for creating a new cellar */
export const createCellarSchema = baseCellarInput.refine((data) => {
  const typesRequiringCapacity = ["aging", "service", "multizone", "combined", "hybrid", "natural"];
  if (typesRequiringCapacity.includes(data.cellarType)) {
    return data.bottleCapacity !== null && data.bottleCapacity !== undefined && data.bottleCapacity > 0;
  }
  return true;
}, {
  message: "Bottle capacity is required for this cellar type",
  path: ["bottleCapacity"],
});

export type CreateCellarInput = z.infer<typeof createCellarSchema>;

/** Input for updating a cellar */
export const updateCellarSchema = baseCellarInput.partial();

export type UpdateCellarInput = z.infer<typeof updateCellarSchema>;

/** Cellar with bottle count for display */
export const cellarWithStatsSchema = cellarSchema.extend({
  bottleCount: z.number().int().nonnegative().optional(),
});

export type CellarWithStats = z.infer<typeof cellarWithStatsSchema>;
