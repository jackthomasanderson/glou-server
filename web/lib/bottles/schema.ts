import { z } from "zod";

export const bottleCategorySchema = z.enum(["wine", "sparkling", "spirit", "cigar"]);
export type BottleCategory = z.infer<typeof bottleCategorySchema>;

export const fillLevelSchema = z.enum(["full", "threeQuarters", "half", "low", "empty"]);
export type FillLevel = z.infer<typeof fillLevelSchema>;

const peakMaturitySchema = z
  .object({
    from: z.number().int().min(1900).max(2100).optional(),
    to: z.number().int().min(1900).max(2100).optional()
  })
  .refine((value) => {
    if (value.from && value.to) {
      return value.from <= value.to;
    }
    return true;
  }, "from must be before to");

const commonBottleSchema = z.object({
  label: z.string().min(1).max(120),
  category: bottleCategorySchema,
  location: z.string().min(1).max(80).optional(),
  collection: z.string().min(1).max(80).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
  photoUrl: z.string().url().optional(),
  isOpened: z.boolean().default(false),
  fillLevel: fillLevelSchema.optional(),
  estimatedValue: z.number().nonnegative().optional(),
  peakMaturity: peakMaturitySchema.optional(),
  alertStatus: z.enum(["none", "approaching", "critical"]).default("none")
});

const wineBottleSchema = commonBottleSchema.extend({
  category: z.literal("wine"),
  producer: z.string().min(1).max(120),
  cuvee: z.string().min(1).max(120),
  vintageOrNV: z.string().min(2).max(12),
  color: z.string().min(1).max(40),
  appellation: z.string().min(1).max(120),
  grapes: z.string().max(160).optional(),
  abv: z.number().min(0).max(20).optional(),
  format: z.string().max(40).optional(),
  servingTemp: z.string().max(40).optional(),
  lotNumber: z.string().max(60).optional(),
  carafing: z.string().max(80).optional()
});

const sparklingBottleSchema = commonBottleSchema.extend({
  category: z.literal("sparkling"),
  house: z.string().min(1).max(120),
  cuvee: z.string().min(1).max(120),
  vintageOrNM: z.string().min(2).max(12),
  style: z.string().min(1).max(60),
  dosage: z.string().max(60).optional(),
  disgorgement: z.string().max(60).optional(),
  pressure: z.string().max(60).optional(),
  baseWine: z.string().max(120).optional(),
  servingTemp: z.string().max(40).optional()
});

const spiritBottleSchema = commonBottleSchema.extend({
  category: z.literal("spirit"),
  distillery: z.string().min(1).max(120),
  edition: z.string().min(1).max(160),
  abv: z.number().min(20).max(80),
  ageStatement: z.string().max(40).optional(),
  caskType: z.string().max(120).optional(),
  batch: z.string().max(60).optional(),
  additiveNote: z.string().max(160).optional(),
  angelShare: z.string().max(120).optional(),
  aromaProfile: z.string().max(200).optional()
});

const cigarBoxSchema = commonBottleSchema.extend({
  category: z.literal("cigar"),
  module: z.string().min(1).max(120),
  rolledAt: z.string().min(2).max(40),
  sealState: z.enum(["sealed", "open"]),
  quantity: z.number().int().min(1).max(200),
  wrapper: z.string().max(80).optional(),
  binder: z.string().max(80).optional(),
  filler: z.string().max(80).optional(),
  factoryCode: z.string().max(40).optional(),
  targetHumidity: z.string().max(40).optional(),
  humidifier: z.string().max(80).optional()
});

export const bottleInputSchema = z.discriminatedUnion("category", [
  wineBottleSchema,
  sparklingBottleSchema,
  spiritBottleSchema,
  cigarBoxSchema
]);

export type WineBottleInput = z.infer<typeof wineBottleSchema>;
export type SparklingBottleInput = z.infer<typeof sparklingBottleSchema>;
export type SpiritBottleInput = z.infer<typeof spiritBottleSchema>;
export type CigarBottleInput = z.infer<typeof cigarBoxSchema>;

export type BottleInput = z.infer<typeof bottleInputSchema>;

export const bottleRecordSchema = z.intersection(
  bottleInputSchema,
  z.object({
    id: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable()
  })
);

export type BottleRecord = z.infer<typeof bottleRecordSchema>;
