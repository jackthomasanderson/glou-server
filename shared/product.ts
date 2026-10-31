// #471 (FEAT-92/101, D9): the families contract of /api/products, shared by
// api/ and web/. A family (`Product`) describes the wine; its units
// (`InventoryItem`) only carry what depends on the physical copies. Dates are
// typed as the API builds them (Date); the web reads Wire<T>. An API test
// checks each type against the Prisma models. Import only from shared/.

import type { AlertStatus, CurveShape, InventoryCategory } from './inventory';

/** Everything that describes the wine, true of every one of its bottles (design.md, "Où vit une donnée"). */
export interface ProductDescription {
  category: InventoryCategory;
  name: string;
  producer: string;
  /** Legacy free-text label, distinct from the collections. */
  collection: string | null;
  tags: string[];
  photoUrl: string | null;
  /** Photos of merged records that were not kept as `photoUrl`. */
  otherPhotoUrls: string[];
  notes: string | null;
  // Wine & sparkling
  vintage: number | null;
  color: string | null;
  region: string | null;
  grapeVarieties: string[];
  alcoholDegree: number | null;
  needsAeration: boolean | null;
  serviceTemp: string | null;
  lotNumber: string | null;
  batchDate: Date | null;
  appellation: string | null;
  classification: string | null;
  sparklingType: string | null;
  sugarLevel: string | null;
  disgorgingDate: Date | null;
  baseYear: number | null;
  // Spirit
  spiritType: string | null;
  edition: string | null;
  declaredAge: number | null;
  caskType: string | null;
  additions: string | null;
  aromaticProfile: string | null;
  isSingleCask: boolean | null;
  caskNumber: string | null;
  caskProof: number | null;
  // Cigar
  format: string | null;
  manufactureYear: number | null;
  leafOrigin: string | null;
  factoryCode: string | null;
  recommendedHumidity: number | null;
  humidificationSystem: string | null;
  // Drinking window, alerts and reminder
  peakMaturityFrom: number | null;
  peakMaturityTo: number | null;
  curveShape: CurveShape | null;
  alertsPaused: boolean;
  consumptionPostponedUntil: Date | null;
  reminderDate: Date | null;
  alertStatus: AlertStatus | null;
}

/** Per-field source tag of a table's own columns (FEAT-05); a field absent is 'manual'. */
export type FieldSources = Record<string, string>;

/**
 * A unit of a family: a group of identical intact copies, a sub-record with a
 * state of its own (opened, finished), or a write-off. No description field
 * at all (D9) and no `lockedFields` (D1: automated enrichment only writes
 * description).
 */
export interface ItemView {
  id: string;
  productId: string;
  /** Audit field (creator), never an access filter. */
  userId: string;
  updatedBy: string | null;
  cellarId: string | null;
  slotColumn: number | null;
  slotRow: number | null;
  location: string | null;
  /** Price and value of ONE copy (bottle, box, single cigar), never of the group. */
  purchasePrice: number | null;
  estimatedValue: number | null;
  purchasePlace: string | null;
  /** Purchase day, `YYYY-MM-DD` both ways (D6): never turned into a local Date. */
  purchasedAt: string | null;
  bottleSize: string | null;
  quantity: number | null;
  cigarsPerBox: number | null;
  cigarsLeft: number | null;
  isOpened: boolean;
  fillLevel: number | null;
  openedAt: Date | null;
  /** The group a sub-record was detached from, if it still exists. */
  parentItemId: string | null;
  /** Broken, given away or lost: out of stock, still in the spending. */
  writtenOffAt: Date | null;
  needsReview: boolean;
  fieldSources: FieldSources | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 409 of a reattach that would delete a sub-record holding tastings: send `keepTastings`. */
export const TASTINGS_ON_ITEM = 'TASTINGS_ON_ITEM';

export interface ProductCollection {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

/**
 * A family as the list shows it (GET /api/products): its description, its
 * collections, its readiness and its units in stock (opened ones included).
 * `items` is empty for a wine known without bottle (FEAT-101); the card line
 * is computed by the client with `summarizeStock` (shared/units.ts).
 */
export interface ProductView extends ProductDescription {
  id: string;
  /** Audit field (creator), never an access filter. */
  userId: string;
  updatedBy: string | null;
  lockedFields: string[];
  fieldSources: FieldSources | null;
  /** Whole-family trash (D10); always empty in the list. */
  deletedAt: Date | null;
  createdAt: Date;
  /** The family's own: a unit change does not move it, a description change does. */
  updatedAt: Date;
  /** FEAT-86: percentage along the drinking curve, null without a window. */
  readiness: number | null;
  /**
   * §10.5: last tasting or last bottle finished, whichever is later — shown
   * on a "Plus en cave" card; null when neither happened.
   */
  lastActivityAt: Date | null;
  collections: ProductCollection[];
  items: ItemView[];
}

/** Response of GET /api/products, capped like the flat list (ISSUE_083). */
export interface ProductList {
  data: ProductView[];
  /** More families exist than the cap: the list is not the whole inventory. */
  truncated: boolean;
}

/** Families listed at most by GET /api/products. */
export const PRODUCT_LIST_LIMIT = 2000;

/** A field change recorded in the history (FEAT-05). */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** One line of a family's history: a change of its description or of one of its units. */
export interface ProductHistoryEntry {
  id: number;
  action: string;
  status: string;
  actorId: string;
  actorName: string;
  /** ISSUE_483: the change came through a guest share link. */
  viaGuest?: boolean;
  /** The unit changed; null for a change of the description itself. */
  itemId: string | null;
  changes: FieldChange[] | null;
  /** FEAT-98 (point 57): how many copies were moved or repriced. */
  count?: number;
  /** FEAT-92 c3: why a number was corrected (`CORRECT_QUANTITY`). */
  reason?: CorrectionReason;
  createdAt: Date;
}

export const TASTING_READINESS = ['TOO_YOUNG', 'PERFECT', 'PEAK', 'PAST'] as const;
export type TastingReadiness = (typeof TASTING_READINESS)[number];

/** A tasting of the family; `itemId` is the bottle tasted, null when tasted elsewhere. */
export interface ProductTasting {
  id: string;
  userId: string;
  itemId: string | null;
  productId: string | null;
  guestName: string | null;
  tastedAt: Date;
  context: string | null;
  rating: number | null;
  readiness: TastingReadiness | null;
  notes: string | null;
  foodPairing: string | null;
  photoUrl: string | null;
  robe: string | null;
  nez: string | null;
  bouche: string | null;
  tanin: number | null;
  acidite: number | null;
  longueurBouche: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A family's detail (GET /api/products/:id): every unit not in the trash
 * (finished and written-off ones included), its tastings, and its history —
 * description changes and unit changes together, most recent first.
 */
export interface ProductDetail extends Omit<ProductView, 'items'> {
  items: ItemView[];
  tastings: ProductTasting[];
  history: ProductHistoryEntry[];
}

/**
 * A family in the trash (GET /api/products/trash), with the units trashed
 * together with it (same `deletedAt`, D10) — restoring it brings back those.
 */
export interface TrashedProductView extends Omit<ProductView, 'items' | 'deletedAt'> {
  deletedAt: Date;
  items: ItemView[];
}

/**
 * D8: the answer of every write that may touch several units — adding,
 * correcting, detaching or reattaching. `data` is the unit that now carries
 * what was asked (the group completed or created, the group corrected, the
 * write-off or the sub-record detached, the unit itself, or the group that
 * absorbed a sub-record). `changed` holds the other units the same
 * transaction modified, `removedIds` the units it deleted (a sub-record
 * absorbed). The flat routes (PATCH /api/inventory/:id, the guest PATCH)
 * answer `data` as their own record (`TData`), so the callers that only
 * read `data` keep working; the guest PATCH answers every unit as the
 * share shows it (`TData`, `TUnit`: prices and notes hidden as asked).
 */
export interface UnitWriteResult<TData = ItemView, TUnit = ItemView> {
  data: TData;
  changed: TUnit[];
  removedIds: string[];
}

/**
 * "Corriger le nombre" (decision #471, point 34): an input error erases the
 * copies (out of the spending too, never below 1); broken / given away /
 * lost detaches them as a write-off (out of stock, still in the spending).
 */
export const CORRECTION_REASONS = ['input_error', 'written_off'] as const;

/** Copies one write may add, or one group may count (and one count answer may say). */
export const MAX_COPIES = 1000;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];
