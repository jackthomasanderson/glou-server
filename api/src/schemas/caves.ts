import { z } from "zod";

export const caveTypeEnum = z.enum(["cellar", "showcase", "climate_cabinet", "rack", "other"]);

/** Cave schema */
export const caveSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  caveType: caveTypeEnum,
  locationDescription: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Cave = z.infer<typeof caveSchema>;

/** Input for creating a new cave */
export const createCaveSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  caveType: caveTypeEnum,
  locationDescription: z.string().nullable().optional(),
});

export type CreateCaveInput = z.infer<typeof createCaveSchema>;

/** Input for updating a cave */
export const updateCaveSchema = createCaveSchema.partial();

export type UpdateCaveInput = z.infer<typeof updateCaveSchema>;

/** Cave with bottle count for display */
export const caveWithStatsSchema = caveSchema.extend({
  bottleCount: z.number().int().nonnegative().optional(),
});

export type CaveWithStats = z.infer<typeof caveWithStatsSchema>;
