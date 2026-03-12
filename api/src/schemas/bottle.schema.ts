import { z } from 'zod';

// ─── Common fields (all categories) ─────────────────────────────────────────

export const commonBottleSchema = z.object({
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  name: z.string().min(1, 'Name is required').max(200),
  producer: z.string().min(1, 'Producer is required').max(200),
  location: z.string().max(200).optional(),
  collection: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  photoUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  purchasePrice: z.number().min(0).optional(),
  purchasePlace: z.string().max(200).optional(),
  estimatedValue: z.number().min(0).optional(),
  isOpened: z.boolean().default(false),
  fillLevel: z.number().int().min(0).max(100).optional(),
  openedAt: z.coerce.date().optional().nullable(),
  reminderDate: z.coerce.date().optional().nullable(),
  alertStatus: z.enum(['none', 'approaching', 'peak', 'past']).default('none'),
  cellarId: z.string().uuid({ message: "Invalid Cellar ID" }).optional().nullable(),
  lockedFields: z.array(z.string()).default([]),
});

// ─── Wine-specific schema ────────────────────────────────────────────────────

export const wineBottleSchema = commonBottleSchema.extend({
  category: z.literal('wine'),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  color: z.enum(['red', 'white', 'rosé', 'orange']).optional(),
  region: z.string().max(200).optional(),
  grapeVarieties: z.array(z.string().max(100)).max(10).default([]),
  alcoholDegree: z.number().min(0).max(100).optional(),
  bottleSize: z.string().max(50).optional(),
  peakMaturity: z.string().max(100).optional(),
  needsAeration: z.boolean().optional(),
  serviceTemp: z.string().max(50).optional(),
  lotNumber: z.string().max(50).optional(),
});

// ─── Sparkling-specific schema ───────────────────────────────────────────────

export const sparklingBottleSchema = commonBottleSchema.extend({
  category: z.literal('sparkling'),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  sparklingType: z.string().max(100).optional(), // Champagne, Crémant, Prosecco...
  sugarLevel: z.string().max(50).optional(),     // brut, extra-brut...
  disgorgingDate: z.coerce.date().optional(),
  baseYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  peakMaturity: z.string().max(100).optional(),
  serviceTemp: z.string().max(50).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
  bottleSize: z.string().max(50).optional(),
});

// ─── Spirit-specific schema ──────────────────────────────────────────────────

export const spiritBottleSchema = commonBottleSchema.extend({
  category: z.literal('spirit'),
  edition: z.string().max(200).optional(),
  alcoholDegree: z.number().min(0).max(100),
  declaredAge: z.string().max(50).optional(),
  caskType: z.string().max(100).optional(),
  additions: z.string().max(500).optional(),
  aromaticProfile: z.string().max(500).optional(),
  lotNumber: z.string().max(50).optional(),
  bottleSize: z.string().max(50).optional(),
});

// ─── Cigar-specific schema ───────────────────────────────────────────────────

export const cigarBottleSchema = commonBottleSchema.extend({
  category: z.literal('cigar'),
  format: z.string().max(100).optional(),
  quantity: z.number().int().min(1).max(1000),
  manufactureYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  sealedStatus: z.enum(['sealed', 'opened']).optional(),
  leafOrigin: z.string().max(200).optional(),
  factoryCode: z.string().max(50).optional(),
  recommendedHumidity: z.number().min(50).max(100).optional(),
  humidificationSystem: z.string().max(200).optional(),
});

// ─── Discriminated union ─────────────────────────────────────────────────────

export const bottleInputSchema = z.discriminatedUnion('category', [
  wineBottleSchema,
  sparklingBottleSchema,
  spiritBottleSchema,
  cigarBottleSchema,
]);

export type BottleInput = z.infer<typeof bottleInputSchema>;
export type BottleCategory = BottleInput['category'];

// ─── Patch schema ────────────────────────────────────────────────────────────
// Uses a flat partial object instead of discriminatedUnion.partial() which is not
// supported by Zod's type system for discriminated unions.

export const bottlePatchSchema = z.object({
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']).optional(),
  name: z.string().min(1).max(200).optional(),
  producer: z.string().min(1).max(200).optional(),
  location: z.string().max(200).optional(),
  collection: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  photoUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  purchasePrice: z.number().min(0).optional(),
  purchasePlace: z.string().max(200).optional(),
  estimatedValue: z.number().min(0).optional(),
  isOpened: z.boolean().optional(),
  fillLevel: z.number().int().min(0).max(100).optional(),
  openedAt: z.coerce.date().optional().nullable(),
  reminderDate: z.coerce.date().optional().nullable(),
  alertStatus: z.enum(['none', 'approaching', 'peak', 'past']).optional(),
  lockedFields: z.array(z.string()).optional(),
  // Wine/Sparkling
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  color: z.enum(['red', 'white', 'rosé', 'orange']).optional(),
  region: z.string().max(200).optional(),
  grapeVarieties: z.array(z.string().max(100)).max(10).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
  bottleSize: z.string().max(50).optional(),
  peakMaturity: z.string().max(100).optional(),
  needsAeration: z.boolean().optional(),
  serviceTemp: z.string().max(50).optional(),
  lotNumber: z.string().max(50).optional(),
  sparklingType: z.string().max(100).optional(),
  sugarLevel: z.string().max(50).optional(),
  disgorgingDate: z.coerce.date().optional(),
  baseYear: z.number().int().optional(),
  // Spirit
  edition: z.string().max(200).optional(),
  declaredAge: z.string().max(50).optional(),
  caskType: z.string().max(100).optional(),
  additions: z.string().max(500).optional(),
  aromaticProfile: z.string().max(500).optional(),
  // Cigar
  format: z.string().max(100).optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  manufactureYear: z.number().int().optional(),
  sealedStatus: z.enum(['sealed', 'opened']).optional(),
  leafOrigin: z.string().max(200).optional(),
  factoryCode: z.string().max(50).optional(),
  recommendedHumidity: z.number().min(50).max(100).optional(),
  humidificationSystem: z.string().max(200).optional(),
  cellarId: z.string().uuid().optional().nullable(),
});

export type BottlePatch = z.infer<typeof bottlePatchSchema>;
