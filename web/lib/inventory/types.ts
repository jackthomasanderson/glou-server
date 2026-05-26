import { z } from 'zod';

// ─── Types miroirs du backend ────────────────────────────────────────────────

export type InventoryCategory = 'wine' | 'sparkling' | 'spirit' | 'cigar';
export type AlertStatus = 'none' | 'approaching' | 'peak' | 'past';

export interface CollectionSummary {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
}

export interface InventoryItem {
  id: string;
  userId: string;
  category: InventoryCategory;
  name: string;
  producer: string;
  location?: string | null;
  collection?: string | null;
  tags: string[];
  photoUrl?: string | null;
  notes?: string | null;
  purchasePrice?: number | null;
  purchasePlace?: string | null;
  estimatedValue?: number | null;

  // Wine/Sparkling
  vintage?: number | null;
  color?: string | null;
  region?: string | null;
  grapeVarieties: string[];
  alcoholDegree?: number | null;
  bottleSize?: string | null;
  peakMaturityFrom?: number | null;
  peakMaturityTo?: number | null;
  needsAeration?: boolean | null;
  serviceTemp?: string | null;
  lotNumber?: string | null;

  // Sparkling extras
  sparklingType?: string | null;
  sugarLevel?: string | null;
  disgorgingDate?: string | null;
  baseYear?: number | null;

  // Spirit
  spiritType?: string | null;
  edition?: string | null;
  declaredAge?: number | null;
  caskType?: string | null;
  additions?: string | null;
  aromaticProfile?: string | null;

  // Cigar
  format?: string | null;
  quantity?: number | null;
  manufactureYear?: number | null;
  leafOrigin?: string | null;
  factoryCode?: string | null;
  recommendedHumidity?: number | null;
  humidificationSystem?: string | null;

  // Cellar
  cellarId?: string | null;
  // Grid slot assignment (FEAT-68)
  slotColumn?: number | null;
  slotRow?: number | null;

  // Cross-cutting
  isOpened: boolean;
  fillLevel?: number | null;
  openedAt?: string | null;
  reminderDate?: string | null;
  alertStatus?: AlertStatus | null;
  alertsPaused?: boolean;
  lockedFields: string[];
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  // Collections (FEAT-13)
  collections?: CollectionSummary[];

  // Traceability (FEAT-62) — present only on single-item GET
  updatedBy?: string | null;
  _creator?: { id: string; name: string } | null;
  _lastEditor?: { id: string; name: string } | null;
}

export interface InventoryFieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface InventoryHistoryEntry {
  id: number;
  action: string;
  status: string;
  actorId: string;
  actorName: string;
  changes: InventoryFieldChange[] | null;
  createdAt: string;
}

// ─── Schéma Zod frontend (validation côté client avant envoi) ─────────────────

export const inventoryFormSchema = z.object({
  category: z.enum(['wine', 'sparkling', 'spirit', 'cigar']),
  name: z.string().min(1, 'Nom requis').max(200),
  producer: z.string().min(1, 'Producteur requis').max(200),
  location: z.string().max(200).optional(),
  collection: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  photoUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  purchasePrice: z.number().min(0).optional(),
  estimatedValue: z.number().min(0).optional(),
  isOpened: z.boolean().default(false),
  fillLevel: z.number().int().min(0).max(100).optional(),
  openedAt: z.string().optional().nullable(),
  reminderDate: z.string().optional().nullable(),
  alertStatus: z.enum(['none', 'approaching', 'peak', 'past']).default('none'),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  quantity: z.number().int().min(1).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
});

export type InventoryFormValues = z.infer<typeof inventoryFormSchema>;
