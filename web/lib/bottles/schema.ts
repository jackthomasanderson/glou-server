import { z } from "zod";

export const bottleCategorySchema = z.enum(["wine", "sparkling", "spirit", "cigar"]);
export type BottleCategory = z.infer<typeof bottleCategorySchema>;

export const fillLevelSchema = z.enum(["full", "threeQuarters", "half", "low", "empty"]);
export type FillLevel = z.infer<typeof fillLevelSchema>;

// Helper to convert empty strings to undefined for optional fields
const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === "" ? undefined : val), schema.or(z.undefined()));

const currentYear = new Date().getFullYear();
const maxVintageYear = currentYear + 1; // allow early releases

const vintageStringSchema = z
  .preprocess((val) => (val === "" ? "NV" : val), z.string())
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => value === "NV" || /^[12][0-9]{3}$/.test(value), "Invalid vintage: use YYYY or NV")
  .refine((value) => {
    if (value === "NV") return true;
    const numericYear = Number(value);
    return numericYear <= maxVintageYear;
  }, "Vintage cannot be in the future");

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
  cellarId: z.string().uuid("Invalid cellar ID"),
  location: emptyStringToUndefined(z.string().min(1).max(80)).optional(),
  collection: emptyStringToUndefined(z.string().min(1).max(80)).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
  photoUrl: emptyStringToUndefined(z.string().url()).optional(),
  isOpened: z.boolean().default(false),
  fillLevel: fillLevelSchema.optional(),
  estimatedValue: z.number().nonnegative().optional(),
  peakMaturity: peakMaturitySchema.optional(),
  alertStatus: z.enum(["none", "approaching", "critical"]).default("none"),
  tastingNote: emptyStringToUndefined(z.string().max(240)).optional(),
  purchasePlace: emptyStringToUndefined(z.string().max(160)).optional(),
  purchasePrice: z.number().nonnegative().optional()
});

const wineBottleSchema = commonBottleSchema.extend({
  category: z.literal("wine"),
  producer: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  vintageOrNone: vintageStringSchema,
  color: emptyStringToUndefined(z.string().min(1).max(40)).optional(),
  appellation: emptyStringToUndefined(z.string().min(1).max(120)).optional(),
  grapes: emptyStringToUndefined(z.string().max(160)).optional(),
  abv: z.number().min(5).max(18).optional(),
  format: emptyStringToUndefined(z.string().max(40)).optional(),
  servingTemp: emptyStringToUndefined(z.string().max(40)).optional(),
  lotNumber: emptyStringToUndefined(z.string().max(60)).optional(),
  carafing: emptyStringToUndefined(z.string().max(80)).optional(),
  requiresAeration: z.boolean().optional()
});

const sparklingBottleSchema = commonBottleSchema
  .extend({
    category: z.literal("sparkling"),
    house: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    vintageOrNone: vintageStringSchema,
    style: emptyStringToUndefined(z.string().min(1).max(60)).optional(),
    dosage: emptyStringToUndefined(z.string().max(60)).optional(),
    disgorgement: emptyStringToUndefined(z.string().max(60)).optional(),
    pressure: emptyStringToUndefined(z.string().max(60)).optional(),
    baseWine: emptyStringToUndefined(z.string().max(120)).optional(),
    servingTemp: emptyStringToUndefined(z.string().max(40)).optional(),
    bottlingDate: emptyStringToUndefined(z.string().max(60)).optional(),
    baseYear: z.number().int().min(1900).max(maxVintageYear).optional()
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
  humidifier: emptyStringToUndefined(z.string().max(60)).optional(),
  manufactureYear: z.number().int().min(1900).max(2100).optional()
});

export const bottleInputSchema = z
  .discriminatedUnion("category", [
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
    updatedAt: z.string()
  })
);

export type BottleRecord = z.infer<typeof bottleRecordSchema>;
