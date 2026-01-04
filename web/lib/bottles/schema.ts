import { z } from "zod";

export const bottleCategorySchema = z.enum(["wine", "sparkling", "spirit", "cigar"]);
export type BottleCategory = z.infer<typeof bottleCategorySchema>;

export const fillLevelSchema = z.enum(["full", "threeQuarters", "half", "low", "empty"]);
export type FillLevel = z.infer<typeof fillLevelSchema>;

// Helper to convert empty strings to undefined for optional fields
const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === "" ? undefined : val), schema.or(z.undefined()));

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
  location: emptyStringToUndefined(z.string().min(1).max(80)).optional(),
  collection: emptyStringToUndefined(z.string().min(1).max(80)).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
  photoUrl: emptyStringToUndefined(z.string().url()).optional(),
  isOpened: z.boolean().default(false),
  fillLevel: fillLevelSchema.optional(),
  estimatedValue: z.number().nonnegative().optional(),
  peakMaturity: peakMaturitySchema.optional(),
  alertStatus: z.enum(["none", "approaching", "critical"]).default("none")
});

const wineBottleSchema = commonBottleSchema.extend({
  category: z.literal("wine"),
  producer: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  vintageOrNone: z.string().min(2).max(12),
  color: emptyStringToUndefined(z.string().min(1).max(40)).optional(),
  appellation: emptyStringToUndefined(z.string().min(1).max(120)).optional(),
  grapes: emptyStringToUndefined(z.string().max(160)).optional(),
  abv: z.number().min(0).max(20).optional(),
  format: emptyStringToUndefined(z.string().max(40)).optional(),
  servingTemp: emptyStringToUndefined(z.string().max(40)).optional(),
  lotNumber: emptyStringToUndefined(z.string().max(60)).optional(),
  carafing: emptyStringToUndefined(z.string().max(80)).optional()
});

const sparklingBottleSchema = commonBottleSchema.extend({
  category: z.literal("sparkling"),
  house: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  vintageOrNone: emptyStringToUndefined(z.string().min(2).max(12)).optional(),
  style: emptyStringToUndefined(z.string().min(1).max(60)).optional(),
  dosage: emptyStringToUndefined(z.string().max(60)).optional(),
  disgorgement: emptyStringToUndefined(z.string().max(60)).optional(),
  pressure: emptyStringToUndefined(z.string().max(60)).optional(),
  baseWine: emptyStringToUndefined(z.string().max(120)).optional(),
  servingTemp: emptyStringToUndefined(z.string().max(40)).optional()
});

const spiritBottleSchema = commonBottleSchema.extend({
  category: z.literal("spirit"),
  distillery: z.string().min(1).max(120),
  nameEdition: z.string().min(1).max(160),
  abv: z.number().min(20).max(80),
  ageStatement: emptyStringToUndefined(z.string().max(40)).optional(),
  caskType: emptyStringToUndefined(z.string().max(120)).optional(),
  batch: emptyStringToUndefined(z.string().max(60)).optional(),
  additiveNote: emptyStringToUndefined(z.string().max(160)).optional(),
  angelShare: emptyStringToUndefined(z.string().max(120)).optional(),
  aromaProfile: emptyStringToUndefined(z.string().max(200)).optional()
});

const cigarBoxSchema = commonBottleSchema.extend({
  category: z.literal("cigar"),
  brand: z.string().min(1).max(120),
  format: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(200),
  wrapper: emptyStringToUndefined(z.string().max(80)).optional(),
  binder: emptyStringToUndefined(z.string().max(80)).optional(),
  filler: emptyStringToUndefined(z.string().max(80)).optional(),
  factoryCode: emptyStringToUndefined(z.string().max(60)).optional(),
  targetHumidity: emptyStringToUndefined(z.string().max(40)).optional(),
  humidifier: emptyStringToUndefined(z.string().max(60)).optional()
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
