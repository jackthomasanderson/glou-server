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

/**
 * FEAT-05 (#471): the description fields a member writes on a wine
 * (PATCH /api/products/:id) and may restore from its history
 * (POST /api/products/:id/rollback). Not `alertStatus` (derived from the
 * drinking window), `otherPhotoUrls` (photos of merged records) nor
 * `consumptionPostponedUntil` (set by its own action). One list for the API
 * and the web; an API test checks it against the description patch schema.
 */
export const RESTORABLE_DESCRIPTION_FIELDS = [
  'category', 'name', 'producer', 'tags', 'photoUrl', 'notes',
  'vintage', 'color', 'region', 'grapeVarieties', 'alcoholDegree', 'needsAeration', 'serviceTemp',
  'lotNumber', 'batchDate', 'appellation', 'classification',
  'sparklingType', 'sugarLevel', 'disgorgingDate', 'baseYear',
  'spiritType', 'edition', 'declaredAge', 'caskType', 'additions', 'aromaticProfile',
  'isSingleCask', 'caskNumber', 'caskProof',
  'format', 'manufactureYear', 'leafOrigin', 'factoryCode', 'recommendedHumidity', 'humidificationSystem',
  'peakMaturityFrom', 'peakMaturityTo', 'curveShape', 'alertsPaused', 'reminderDate',
] as const satisfies readonly (keyof ProductDescription)[];

const RESTORABLE_DESCRIPTION_FIELD_SET: ReadonlySet<string> = new Set(RESTORABLE_DESCRIPTION_FIELDS);

export const isRestorableDescriptionField = (field: string): boolean => RESTORABLE_DESCRIPTION_FIELD_SET.has(field);

/** Per-field source tag of a table's own columns (FEAT-05); a field absent is 'manual'. */
export type FieldSources = Record<string, string>;

/** FEAT-93: one cell of the cellar plan (1-based) held by one copy of a unit. */
export interface ItemSlotView {
  id: string;
  column: number;
  row: number;
}

/** FEAT-93: a cell of the cellar plan (1-based), without the slot holding it. */
export interface SlotCell {
  column: number;
  row: number;
}

/**
 * FEAT-93 (lot S2): which copy an opening, a drink or a smoke takes off a
 * line of several holding cells — the one in the cell `fromSlotId`, or an
 * unplaced one (`fromUnplaced`). One or the other, never in bulk.
 */
// A type literal, not an interface: it joins a request body (`Record<string, unknown>`).
export type SlotChoiceFields = {
  fromSlotId?: string;
  fromUnplaced?: true;
};

/**
 * 409 of an opening, a drink or a smoke on a line of several copies holding
 * at least one cell, sent without {@link SlotChoiceFields}: the cells of the
 * line and its copies unplaced, to ask "De quelle case ?".
 */
export const SLOT_CHOICE_REQUIRED = 'SLOT_CHOICE_REQUIRED';
/** 409: the cell chosen (`fromSlotId`) is no longer the line's, or no copy of it is unplaced any more. */
export const SLOT_CHANGED = 'SLOT_CHANGED';
export interface SlotChoiceDetails {
  slots: ItemSlotView[];
  unplaced: number;
}

/**
 * 409 of a write that leaves a line fewer copies than cells (a correction,
 * a write-off, a move or a new price of part of it, a lower number) sent
 * without a valid `slotIds`: `needed` cells at least must be named among
 * `slots` — freed (or, for a new price, following the copies repriced).
 */
export const SLOTS_TO_FREE_REQUIRED = 'SLOTS_TO_FREE_REQUIRED';
export interface SlotsToFreeDetails {
  needed: number;
  slots: ItemSlotView[];
}

/**
 * #852: 409 of a cellar edit that makes its grid smaller (or removes it)
 * while copies are placed in the cells it takes away: those cells, with the
 * wine (or cigar) in each, to empty or move first.
 */
export const SLOTS_OUTSIDE_GRID = 'SLOTS_OUTSIDE_GRID';
export interface SlotsOutsideGridDetails {
  slots: Array<SlotCell & { name: string }>;
}

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
  /**
   * FEAT-93: the cells of the cellar plan its copies occupy (live ones,
   * by row then column): up to its copies in stock (`slotCapacity`).
   */
  slots: ItemSlotView[];
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

/**
 * Recette #847 (n°5 ter): every field a change of the history can name —
 * the wine's description, a copy's columns (state included), a cell of the
 * plan, and the names recorded before (`slotColumn`/`slotRow`, `isOwned`).
 * Each has a label in both languages (no raw key such as "Cigars Left"):
 * a web test checks the labels, an API test that the API records no other.
 */
export const HISTORY_FIELDS = [
  ...RESTORABLE_DESCRIPTION_FIELDS, 'alertStatus', 'consumptionPostponedUntil',
  'cellarId', 'location', 'purchasedAt', 'purchasePrice', 'purchasePlace', 'estimatedValue', 'bottleSize',
  'quantity', 'cigarsPerBox', 'isOpened', 'fillLevel', 'openedAt', 'cigarsLeft',
  'parentItemId', 'writtenOffAt', 'needsReview', 'lockedFields',
  'slot', 'slotColumn', 'slotRow', 'isOwned',
] as const;

/** Recette #847: what was done to a copy, said in one word ("1 bouteille ouverte", "1 bouteille bue", "1 cigare fumé"). */
export type HistoryGesture = 'opened' | 'finished' | 'smoked';

/** One line of a family's history: a change of its description or of one of its units. */
export interface ProductHistoryEntry {
  id: number;
  action: string;
  status: string;
  /** #695: null once the member was deleted for good (actorName keeps their name). */
  actorId: string | null;
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
  /** #471 (W3): an edited line that joined this group — what its edit changed. */
  joinedChanges?: FieldChange[];
  /**
   * #471: recorded on a line since absorbed by this one (lines joined, a
   * merge, a move): its values were that line's, so restoring one would
   * rewrite every copy of this line — never offered, refused by the API.
   */
  absorbed?: boolean;
  /** Recette #847: the entry tells a copy opened, finished (drunk) or a cigar smoked. */
  gesture?: HistoryGesture;
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
  /**
   * #837: the bottle tasted as it was when tasted — its cellar (null once
   * deleted: `cellarName` then) and its purchase day. All null for a wine
   * tasted elsewhere and for a tasting noted before #837. `snapshotAt` is set
   * with them: kept, even all null (a bottle in no cellar), when it is set.
   */
  snapshotAt: Date | null;
  cellarId: string | null;
  cellarName: string | null;
  purchasedAt: Date | null;
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

/**
 * #471 (FEAT-111, D18): the bulk actions on wines selected in the list —
 * POST /api/products/bulk-move, bulk-trash and bulk-drink. At most
 * {@link MAX_BULK_WINES} wines per action (the bound of the bulk edit).
 */
export const MAX_BULK_WINES = 500;

/** What a bulk action did: on how many wines, and how many bottles or cigars it moved, trashed or finished. */
export interface BulkStockResult {
  wines: number;
  units: number;
}

/**
 * The request of a bulk action, by its route (`/api/products/bulk-<action>`):
 * every bottle in the cellar of the wines moved or trashed, or how many of
 * each drunk ("Marquer comme bus"; `openedFirst`: an opened bottle finished
 * first, true by default; `cellarIds`: the cellars looked at, FEAT-104).
 */
export type BulkWinesAction =
  | { action: 'move'; productIds: string[]; cellarId: string | null }
  | { action: 'trash'; productIds: string[] }
  | { action: 'drink'; items: Array<{ productId: string; count: number; openedFirst?: boolean }>; cellarIds?: string[] };

/** The refusals of a bulk action the dialog names; any other one is the generic message. */
export const BULK_WINES_ERRORS = ['COUNT_ABOVE_STOCK', 'QUANTITY_TOO_LARGE', 'CELLAR_NOT_FOUND'] as const;
