import { z } from "zod";

export const bottleCategorySchema = z.enum(["wine", "sparkling", "spirit", "cigar"]);
export type BottleCategory = z.infer<typeof bottleCategorySchema>;

export const fillLevelSchema = z.enum(["full", "threeQuarters", "half", "low", "empty"]);
export type FillLevel = z.infer<typeof fillLevelSchema>;

export const alertStatusSchema = z.enum(["none", "approaching", "critical"]);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

// Helper to convert empty strings to undefined for optional fields
const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === "" || val === null ? undefined : val), schema.or(z.undefined()));

// Helper to convert null to undefined for update operations
const nullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === null ? undefined : val), schema.optional());

const currentYear = new Date().getFullYear();
const maxVintageYear = currentYear + 1;

const vintageStringSchema = z
  .preprocess((val) => (val === "" || val === null ? "NV" : val), z.string())
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => value === "NV" || /^[12][0-9]{3}$/.test(value), "Invalid vintage: use YYYY or NV")
  .refine((value) => {
    if (value === "NV") return true;
    const numericYear = Number(value);
    return numericYear <= maxVintageYear;
  }, "Vintage cannot be in the future");

const peakMaturitySchema = z
  .object({
    from: z.preprocess((val) => val === null ? undefined : val, z.number().int().min(1900).max(2100).optional()),
    to: z.preprocess((val) => val === null ? undefined : val, z.number().int().min(1900).max(2100).optional())
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
  photoUrl: emptyStringToUndefined(z.string()).optional(),
  isOpened: z.boolean().default(false),
  fillLevel: fillLevelSchema.optional(),
  estimatedValue: z.number().nonnegative().optional(),
  peakMaturity: peakMaturitySchema.optional(),
  alertStatus: alertStatusSchema.default("none"),
  tastingNote: emptyStringToUndefined(z.string().max(240)).optional(),
  purchasePlace: emptyStringToUndefined(z.string().max(160)).optional(),
  purchasePrice: z.number().nonnegative().optional(),
  quantity: z.number().int().min(1).max(200).default(1)
});

const wineBottleSchema = commonBottleSchema.extend({
  category: z.literal("wine"),
  producer: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  vintageOrNone: vintageStringSchema,
  color: z.enum(["red", "white", "rose", "orange", "yellow"]),
  appellation: emptyStringToUndefined(z.string().min(1).max(120)).optional(),
  grapes: emptyStringToUndefined(z.string().max(160)).optional(),
  abv: z.number().min(5).max(18).optional(),
  format: emptyStringToUndefined(z.string().max(40)).optional(),
  servingTemp: emptyStringToUndefined(z.string().max(40)).optional(),
  lotNumber: emptyStringToUndefined(z.string().max(60)).optional(),
  carafing: emptyStringToUndefined(z.string().max(80)).optional(),
  requiresAeration: z.boolean().optional()
});

const sparklingBottleSchema = commonBottleSchema.extend({
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
  wrapper: emptyStringToUndefined(z.string().max(80)).optional(),
  binder: emptyStringToUndefined(z.string().max(80)).optional(),
  filler: emptyStringToUndefined(z.string().max(80)).optional(),
  factoryCode: emptyStringToUndefined(z.string().max(60)).optional(),
  targetHumidity: emptyStringToUndefined(z.string().max(40)).optional(),
  humidifier: emptyStringToUndefined(z.string().max(60)).optional(),
  manufactureYear: z.number().int().min(1900).max(2100).optional()
});

export const createBottleSchema = z.discriminatedUnion("category", [
  wineBottleSchema,
  sparklingBottleSchema,
  spiritBottleSchema,
  cigarBoxSchema
]);

export type CreateBottleInput = z.infer<typeof createBottleSchema>;

// Update schema: simpler approach - use the base schema but make all fields optional
export const updateBottleSchema = z.object({
  id: z.string().uuid(),
  label: nullToUndefined(z.string().min(1).max(120)),
  category: nullToUndefined(bottleCategorySchema),
  cellarId: nullToUndefined(z.string().uuid()),
  location: emptyStringToUndefined(z.string().min(1).max(80)).optional(),
  collection: emptyStringToUndefined(z.string().min(1).max(80)).optional(),
  tags: nullToUndefined(z.array(z.string().min(1).max(40)).max(10)),
  photoUrl: emptyStringToUndefined(z.string()).optional(),
  isOpened: nullToUndefined(z.boolean()),
  fillLevel: nullToUndefined(fillLevelSchema),
  estimatedValue: z.preprocess((val) => {
    if (val === null || val === undefined || val === "") return undefined;
    if (typeof val === "string") return parseFloat(val);
    return val;
  }, z.number().nonnegative().optional()),
  peakMaturity: nullToUndefined(peakMaturitySchema),
  alertStatus: nullToUndefined(alertStatusSchema),
  tastingNote: emptyStringToUndefined(z.string().max(240)).optional(),
  purchasePlace: emptyStringToUndefined(z.string().max(160)).optional(),
  purchasePrice: z.preprocess((val) => {
    if (val === null || val === undefined || val === "") return undefined;
    if (typeof val === "string") return parseFloat(val);
    return val;
  }, z.number().nonnegative().optional()),
  // Wine-specific
  producer: emptyStringToUndefined(z.string().min(1).max(120)),
  name: emptyStringToUndefined(z.string().min(1).max(120)),
  vintageOrNone: nullToUndefined(vintageStringSchema),
  color: nullToUndefined(z.enum(["red", "white", "rose", "orange", "yellow"])),
  appellation: emptyStringToUndefined(z.string().min(1).max(120)).optional(),
  grapes: emptyStringToUndefined(z.string().max(160)).optional(),
  abv: z.preprocess((val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === "string") return parseFloat(val);
    return val;
  }, z.number().optional()),
  format: emptyStringToUndefined(z.string().max(40)).optional(),
  servingTemp: emptyStringToUndefined(z.string().max(40)).optional(),
  lotNumber: emptyStringToUndefined(z.string().max(60)).optional(),
  carafing: emptyStringToUndefined(z.string().max(80)).optional(),
  requiresAeration: nullToUndefined(z.boolean()),
  // Sparkling-specific
  house: emptyStringToUndefined(z.string().min(1).max(120)),
  style: emptyStringToUndefined(z.string().min(1).max(60)).optional(),
  dosage: emptyStringToUndefined(z.string().max(60)).optional(),
  disgorgement: emptyStringToUndefined(z.string().max(60)).optional(),
  pressure: emptyStringToUndefined(z.string().max(60)).optional(),
  baseWine: emptyStringToUndefined(z.string().max(120)).optional(),
  bottlingDate: emptyStringToUndefined(z.string().max(60)).optional(),
  baseYear: nullToUndefined(z.number().int().min(1900).max(maxVintageYear)),
  // Spirit-specific
  distillery: emptyStringToUndefined(z.string().min(1).max(120)),
  nameEdition: emptyStringToUndefined(z.string().min(1).max(160)),
  ageStatement: emptyStringToUndefined(z.string().max(40)).optional(),
  caskType: emptyStringToUndefined(z.string().max(120)).optional(),
  batch: emptyStringToUndefined(z.string().max(60)).optional(),
  additiveNote: emptyStringToUndefined(z.string().max(160)).optional(),
  angelShare: emptyStringToUndefined(z.string().max(120)).optional(),
  aromaProfile: emptyStringToUndefined(z.string().max(200)).optional(),
  // Cigar-specific
  brand: emptyStringToUndefined(z.string().min(1).max(120)),
  quantity: nullToUndefined(z.number().int().min(1).max(200)),
  wrapper: emptyStringToUndefined(z.string().max(80)).optional(),
  binder: emptyStringToUndefined(z.string().max(80)).optional(),
  filler: emptyStringToUndefined(z.string().max(80)).optional(),
  factoryCode: emptyStringToUndefined(z.string().max(60)).optional(),
  targetHumidity: emptyStringToUndefined(z.string().max(40)).optional(),
  humidifier: emptyStringToUndefined(z.string().max(60)).optional(),
  manufactureYear: nullToUndefined(z.number().int().min(1900).max(2100))
});

export type UpdateBottleInput = z.infer<typeof updateBottleSchema>;

// Database record schema (includes audit fields)
export const bottleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  cellarId: z.string().uuid(),
  label: z.string().min(1).max(120),
  category: bottleCategorySchema,
  producer: z.string().optional(),
  house: z.string().optional(),
  distillery: z.string().optional(),
  brand: z.string().optional(),
  name: z.string().optional(),
  vintageOrNone: z.string(),
  abv: z.number().optional(),
  isOpened: z.boolean(),
  fillLevel: fillLevelSchema.optional(),
  color: z.string().optional(),
  appellation: z.string().optional(),
  grapes: z.string().optional(),
  format: z.string().optional(),
  servingTemp: z.string().optional(),
  lotNumber: z.string().optional(),
  carafing: z.string().optional(),
  requiresAeration: z.boolean().optional(),
  style: z.string().optional(),
  dosage: z.string().optional(),
  disgorgement: z.string().optional(),
  pressure: z.string().optional(),
  baseWine: z.string().optional(),
  bottlingDate: z.string().optional(),
  baseYear: z.number().optional(),
  ageStatement: z.string().optional(),
  caskType: z.string().optional(),
  batch: z.string().optional(),
  additiveNote: z.string().optional(),
  angelShare: z.string().optional(),
  aromaProfile: z.string().optional(),
  formatBox: z.string().optional(),
  cigarFormat: z.string().optional(),
  quantity: z.number().optional(),
  manufactureYear: z.number().optional(),
  sealState: z.string().optional(),
  wrapper: z.string().optional(),
  factoryCode: z.string().optional(),
  targetHumidity: z.string().optional(),
  humidifier: z.string().optional(),
  location: z.string().optional(),
  collection: z.string().optional(),
  photoUrl: z.string().optional(),
  estimatedValue: z.number().optional(),
  peakMaturityFrom: z.number().optional(),
  peakMaturityTo: z.number().optional(),
  alertStatus: alertStatusSchema,
  tastingNote: z.string().optional(),
  purchasePlace: z.string().optional(),
  purchasePrice: z.number().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable()
});

export type Bottle = z.infer<typeof bottleSchema>;
