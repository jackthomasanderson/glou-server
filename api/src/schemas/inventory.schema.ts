import { z } from 'zod';

// ─── Common fields (all categories) ─────────────────────────────────────────

export const commonInventorySchema = z.object({
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  name: z.string().min(1, 'Name is required').max(200),
  producer: z.string().min(1, 'Producer is required').max(200),
  location: z.string().max(200).optional(),
  collection: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  photoUrl: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  purchasePrice: z.number().min(0).optional(),
  purchasePlace: z.string().max(200).optional(),
  estimatedValue: z.number().min(0).optional(),
  isOpened: z.boolean().default(false),
  fillLevel: z.number().int().min(0).max(100).optional(),
  openedAt: z.coerce.date().optional().nullable(),
  reminderDate: z.coerce.date().optional().nullable(),
  alertStatus: z.enum(['none', 'approaching', 'peak', 'past']).default('none'),
  cellarId: z.string().optional().nullable(),
  lockedFields: z.array(z.string()).default([]),
});

// ─── Wine-specific schema ────────────────────────────────────────────────────

export const wineInventorySchema = commonInventorySchema.extend({
  category: z.literal('wine'),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  color: z.enum(['red', 'white', 'rosé', 'orange']).optional(),
  region: z.string().max(200).optional(),
  grapeVarieties: z.array(z.string().max(100)).max(10).default([]),
  alcoholDegree: z.number().min(0).max(100).optional(),
  bottleSize: z.string().max(50).optional(),
  peakMaturityFrom: z.number().int().min(1800).max(2200).optional().nullable(),
  peakMaturityTo: z.number().int().min(1800).max(2200).optional().nullable(),
  needsAeration: z.boolean().optional(),
  serviceTemp: z.string().max(50).optional(),
  lotNumber: z.string().max(50).optional(),
});

// ─── Sparkling-specific schema ───────────────────────────────────────────────

export const sparklingInventorySchema = commonInventorySchema.extend({
  category: z.literal('sparkling'),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  sparklingType: z.enum(['champagne', 'cremant', 'prosecco', 'cava', 'petnat', 'other']).optional(),
  sugarLevel: z.enum(['extra-brut', 'brut', 'extra-sec', 'sec', 'demi-sec', 'doux']).optional(),
  disgorgingDate: z.coerce.date().optional(),
  baseYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  peakMaturityFrom: z.number().int().min(1800).max(2200).optional().nullable(),
  peakMaturityTo: z.number().int().min(1800).max(2200).optional().nullable(),
  serviceTemp: z.string().max(50).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
  bottleSize: z.string().max(50).optional(),
});

// ─── Spirit-specific schema ──────────────────────────────────────────────────

export const spiritInventorySchema = commonInventorySchema.extend({
  category: z.literal('spirit'),
  spiritType: z.string().max(50).optional(),
  edition: z.string().max(200).optional(),
  alcoholDegree: z.number().min(0).max(100),
  declaredAge: z.number().int().min(0).max(200).optional(),
  caskType: z.string().max(100).optional(),
  additions: z.string().max(500).optional(),
  aromaticProfile: z.string().max(500).optional(),
  lotNumber: z.string().max(50).optional(),
  bottleSize: z.string().max(50).optional(),
});

// ─── Cigar-specific schema ───────────────────────────────────────────────────

export const cigarInventorySchema = commonInventorySchema.extend({
  category: z.literal('cigar'),
  format: z.string().max(100).optional(),
  quantity: z.number().int().min(1).max(1000),
  manufactureYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  leafOrigin: z.string().max(200).optional(),
  factoryCode: z.string().max(50).optional(),
  recommendedHumidity: z.number().min(50).max(100).optional(),
  humidificationSystem: z.string().max(200).optional(),
});

// ─── Discriminated union ─────────────────────────────────────────────────────

export const inventoryInputSchema = z.discriminatedUnion('category', [
  wineInventorySchema,
  sparklingInventorySchema,
  spiritInventorySchema,
  cigarInventorySchema,
]);

export type InventoryInput = z.infer<typeof inventoryInputSchema>;
export type InventoryCategory = InventoryInput['category'];

// ─── Patch schema ────────────────────────────────────────────────────────────
// Uses a flat partial object instead of discriminatedUnion.partial() which is not
// supported by Zod's type system for discriminated unions.

export const inventoryPatchSchema = z.object({
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']).optional(),
  name: z.string().min(1).max(200).optional(),
  producer: z.string().min(1).max(200).optional(),
  location: z.string().max(200).optional().nullable(),
  collection: z.string().max(200).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  photoUrl: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  purchasePrice: z.number().min(0).optional().nullable(),
  purchasePlace: z.string().max(200).optional().nullable(),
  estimatedValue: z.number().min(0).optional().nullable(),
  isOpened: z.boolean().optional(),
  fillLevel: z.number().int().min(0).max(100).optional().nullable(),
  openedAt: z.coerce.date().optional().nullable(),
  reminderDate: z.coerce.date().optional().nullable(),
  alertStatus: z.enum(['none', 'approaching', 'peak', 'past']).optional().nullable(),
  alertsPaused: z.boolean().optional(),
  lockedFields: z.array(z.string()).optional(),
  // Wine/Sparkling
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional().nullable(),
  color: z.enum(['red', 'white', 'rosé', 'orange']).optional().nullable(),
  region: z.string().max(200).optional().nullable(),
  grapeVarieties: z.array(z.string().max(100)).max(10).optional(),
  alcoholDegree: z.number().min(0).max(100).optional().nullable(),
  bottleSize: z.string().max(50).optional().nullable(),
  peakMaturityFrom: z.number().int().min(1800).max(2200).optional().nullable(),
  peakMaturityTo: z.number().int().min(1800).max(2200).optional().nullable(),
  needsAeration: z.boolean().optional().nullable(),
  serviceTemp: z.string().max(50).optional().nullable(),
  lotNumber: z.string().max(50).optional().nullable(),
  sparklingType: z.enum(['champagne', 'cremant', 'prosecco', 'cava', 'petnat', 'other']).optional().nullable(),
  sugarLevel: z.enum(['extra-brut', 'brut', 'extra-sec', 'sec', 'demi-sec', 'doux']).optional().nullable(),
  disgorgingDate: z.coerce.date().optional().nullable(),
  baseYear: z.number().int().optional().nullable(),
  // Spirit
  spiritType: z.string().max(50).optional().nullable(),
  edition: z.string().max(200).optional().nullable(),
  declaredAge: z.number().int().min(0).max(200).optional().nullable(),
  caskType: z.string().max(100).optional().nullable(),
  additions: z.string().max(500).optional().nullable(),
  aromaticProfile: z.string().max(500).optional().nullable(),
  // Cigar
  format: z.string().max(100).optional().nullable(),
  quantity: z.number().int().min(1).max(1000).optional().nullable(),
  manufactureYear: z.number().int().optional().nullable(),
  leafOrigin: z.string().max(200).optional().nullable(),
  factoryCode: z.string().max(50).optional().nullable(),
  recommendedHumidity: z.number().min(50).max(100).optional().nullable(),
  humidificationSystem: z.string().max(200).optional().nullable(),
  cellarId: z.preprocess(v => (v === 'none' || v === '') ? null : v, z.string().optional().nullable()),
  // Grid slot assignment (FEAT-68)
  slotColumn: z.number().int().min(1).max(100).optional().nullable(),
  slotRow: z.number().int().min(1).max(100).optional().nullable(),
});

export type InventoryPatch = z.infer<typeof inventoryPatchSchema>;

// ─── Guest-restricted update schema (FEAT-37) ────────────────────────────────
// Guests with write access on a cellar (via GuestShare.writeCellarIds) may only
// touch consumption/service state — never pricing, structural, or category fields.
// `.strict()` rejects any unexpected key outright (defense in depth).

export const guestInventoryUpdateSchema = z
  .object({
    isOpened: z.boolean().optional(),
    openedAt: z.coerce.date().optional().nullable(),
    fillLevel: z.number().int().min(0).max(100).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();

export type GuestInventoryUpdate = z.infer<typeof guestInventoryUpdateSchema>;

// ─── Field rollback (FEAT-05) ────────────────────────────────────────────────
// Restores a single field to a value already present in the item's real
// audit history (see InventoryService.rollbackField, which re-validates
// `toValue` server-side against the tracked history — this schema only
// checks shape).

export const rollbackFieldSchema = z.object({
  field: z.string().min(1).max(100),
  toValue: z.unknown(),
});

export type RollbackFieldInput = z.infer<typeof rollbackFieldSchema>;
