import { z } from 'zod';
import {
  ALERT_STATUSES, CATEGORY_VALUES, CURVE_SHAPES,
  type AlertStatus, type CurveShape, type FieldSource, type InventoryCategory,
} from '@shared/inventory';

// ─── Types miroirs du backend ────────────────────────────────────────────────

// ISSUE_137 / #466: the category list is declared once, in shared/inventory.ts,
// with the alert statuses, curve shapes and FieldSource (FEAT-05). Every
// `type X = 'wine' | …` duplicate across web/lib aliases InventoryCategory, and
// the Zod schema below derives from the same arrays. #102: FieldSource's unused
// 'enrichment' value (a lookup never built, #74) was removed.
export { CATEGORY_VALUES };
export type { AlertStatus, CurveShape, FieldSource, InventoryCategory };

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
  // FEAT-86: consumption-curve shape for the drinking window (null = LINEAR).
  curveShape?: CurveShape | null;
  needsAeration?: boolean | null;
  serviceTemp?: string | null;
  lotNumber?: string | null;

  // Wine collector fields (data-model audit, Task 2, expert mode only)
  appellation?: string | null;
  classification?: string | null;

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

  // Spirit cask/batch collector fields (data-model audit, Task 3, expert mode only)
  batchDate?: string | null;
  isSingleCask?: boolean | null;
  caskNumber?: string | null;
  caskProof?: number | null;

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
  // FEAT-87: false = non-owned reference (described, not possessed). Absent
  // on items returned by an older API: treated as owned.
  isOwned?: boolean;
  isOpened: boolean;
  fillLevel?: number | null;
  openedAt?: string | null;
  reminderDate?: string | null;
  alertStatus?: AlertStatus | null;
  // FEAT-86: readiness percentage (0-100) for the current year, pre-computed
  // server-side from `curveShape` + the window. null when there is no window.
  readiness?: number | null;
  alertsPaused?: boolean;
  lockedFields: string[];
  // Per-field source tag (FEAT-05) — absent field = implicit 'manual'
  fieldSources?: Partial<Record<string, FieldSource>> | null;
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
  /** Set when the change came through a guest share link (#483). */
  viaGuest?: boolean;
  changes: InventoryFieldChange[] | null;
  createdAt: string;
}

// ─── Schéma Zod frontend (validation côté client avant envoi) ─────────────────

export const inventoryFormSchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  name: z.string().min(1, 'Nom requis').max(200),
  producer: z.string().min(1, 'Producteur requis').max(200),
  location: z.string().max(200).optional(),
  collection: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  photoUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  purchasePrice: z.number().min(0).optional(),
  estimatedValue: z.number().min(0).optional(),
  isOwned: z.boolean().default(true),
  isOpened: z.boolean().default(false),
  fillLevel: z.number().int().min(0).max(100).optional(),
  openedAt: z.string().optional().nullable(),
  reminderDate: z.string().optional().nullable(),
  alertStatus: z.enum(ALERT_STATUSES).default('none'),
  curveShape: z.enum(CURVE_SHAPES).optional().nullable(),
  vintage: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  quantity: z.number().int().min(1).optional(),
  alcoholDegree: z.number().min(0).max(100).optional(),
});

export type InventoryFormValues = z.infer<typeof inventoryFormSchema>;
