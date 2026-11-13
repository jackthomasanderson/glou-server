import type { ItemSlotView, SlotCell, SlotChoiceFields } from '@shared/product';
import {
  ALERT_URGENCY_ORDER, CATEGORY_VALUES,
  type AlertStatus, type CurveShape, type FieldSource, type InventoryCategory,
} from '@shared/inventory';

// ─── Types miroirs du backend ────────────────────────────────────────────────

// ISSUE_137 / #466: the category list is declared once, in shared/inventory.ts,
// with the alert statuses, curve shapes and FieldSource (FEAT-05). Every
// `type X = 'wine' | …` duplicate across web/lib aliases InventoryCategory. #102: FieldSource's unused
// 'enrichment' value (a lookup never built, #74) was removed.
export { CATEGORY_VALUES };
export type { AlertStatus, CurveShape, FieldSource, InventoryCategory };

/** #644: rank of a status in the shared ALERT_URGENCY_ORDER; a missing or unknown status ranks with 'none'. */
export function alertUrgency(status: string | null | undefined): number {
  return ALERT_URGENCY_ORDER[status as AlertStatus] ?? ALERT_URGENCY_ORDER.none;
}

export interface CollectionSummary {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
}

export interface InventoryItem {
  id: string;
  /** #471: the wine (family) this bottle belongs to; absent on a locally drafted item. */
  productId?: string;
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
  /** #471: the day the bottles were bought, `YYYY-MM-DD` both ways (D6) — never turned into a local Date. */
  purchasedAt?: string | null;

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
  /** #471 (FEAT-95): cigars per closed box of the group; null = single cigars (and bottles). */
  cigarsPerBox?: number | null;
  /** #471: cigars left in an opened box (null = a closed, complete box). */
  cigarsLeft?: number | null;
  /** #471: broken, given away or lost (out of stock, still in the spending). */
  writtenOffAt?: string | null;
  manufactureYear?: number | null;
  leafOrigin?: string | null;
  factoryCode?: string | null;
  recommendedHumidity?: number | null;
  humidificationSystem?: string | null;

  // Cellar
  cellarId?: string | null;
  // FEAT-93: the cells of the cellar plan its copies occupy (live ones).
  slots?: ItemSlotView[];

  // Cross-cutting
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
  /** #695: `name` is null once that member was deleted for good. */
  _lastEditor?: { id: string; name: string | null } | null;
}

/**
 * A write to one bottle or cigar line (PATCH /api/inventory/:id): its own
 * fields, or an instruction to the detach rule (#471, K): `smokeOne` smokes
 * one cigar — the first of a closed box opens it, a single cigar is finished;
 * `keepTastings` answers "keep the tasting?" when a bottle holding one is
 * put back with the others (FEAT-106).
 */
export type InventoryItemPatch = Partial<InventoryItem> & SlotChoiceFields & {
  smokeOne?: true;
  keepTastings?: boolean;
  /** #471 (FEAT-107 c3): the tasting noted with this state follows the bottle detached from its group. */
  tastingId?: string;
  /** FEAT-93: "Annuler" of a line finished in place — its cell back, if nobody took it since. */
  placeAt?: SlotCell;
};

export interface InventoryFieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface InventoryHistoryEntry {
  id: number;
  action: string;
  status: string;
  actorId: string | null;
  actorName: string;
  /** Set when the change came through a guest share link (#483). */
  viaGuest?: boolean;
  changes: InventoryFieldChange[] | null;
  createdAt: string;
}
