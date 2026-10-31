// #471 (FEAT-102): the "À vérifier après la mise à jour" contract and its
// pure rules, shared by api/ and web/. Two kinds of cases: families of the
// same wine (`productKey`) left apart ("À regrouper ?"), and groups whose
// number the transformation guessed (`needsReview`). The fusion of identical
// groups after a merge follows the migration's rule 4 (design.md), checked
// against the bench's case table (e2e/migration/fixtures/units-cases.json).
// Import only from shared/.

import type { ItemView, ProductView } from './product';
import { groupKey, isGroupableItem, type GroupKeyFields, type UnitKind } from './units';

/**
 * The description fields compared when families of one wine meet (D2) — what
 * "À regrouper ?" may show side by side. Not compared: the key itself
 * (category, producer, name), photo, notes, tags, collections, the legacy
 * `collection` label and the non-descriptive family fields (D3).
 */
export const REVIEW_FIELDS = [
  'vintage', 'color', 'region', 'grapeVarieties', 'alcoholDegree', 'needsAeration', 'serviceTemp',
  'lotNumber', 'batchDate', 'appellation', 'classification', 'sparklingType', 'sugarLevel',
  'disgorgingDate', 'baseYear', 'spiritType', 'edition', 'declaredAge', 'caskType', 'additions',
  'aromaticProfile', 'isSingleCask', 'caskNumber', 'caskProof', 'format', 'manufactureYear',
  'leafOrigin', 'factoryCode', 'recommendedHumidity', 'humidificationSystem',
  'peakMaturityFrom', 'peakMaturityTo',
] as const;

export type ReviewField = (typeof REVIEW_FIELDS)[number];

/** Date-valued compared fields: a Date on the API side, an ISO string on the wire. */
const DATE_FIELDS: ReadonlySet<ReviewField> = new Set<ReviewField>(['batchDate', 'disgorgingDate']);

/** Same normalisation as `productKey` (shared/units.ts); SQL: fam_norm. Empty = null. */
const normalizeText = (value: string): string | null => value.trim().toLowerCase() || null;

/**
 * A compared value as D2 compares it: texts normalised, lists as sets of
 * normalised values, numbers, booleans and dates strictly. Null when empty —
 * an empty value is never a disagreement.
 */
export function comparableValue(field: ReviewField, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (DATE_FIELDS.has(field)) return new Date(value as Date | string).toISOString();
  if (Array.isArray(value)) {
    const set = [...new Set(value.map((entry) => normalizeText(String(entry))).filter((entry) => entry !== null))].sort();
    return set.length > 0 ? JSON.stringify(set) : null;
  }
  if (typeof value === 'string') return normalizeText(value);
  return JSON.stringify(value);
}

/** What a family brings to the comparison. */
export type ReviewFamily = { id: string; createdAt: Date | string; updatedAt: Date | string } & Record<ReviewField, unknown>;

const time = (value: Date | string) => new Date(value).getTime();

/**
 * Decision #471, point 40: the family whose value is pre-selected for
 * `field` — the most recently changed one holding a value (then the most
 * recently created, then the id), or null when none has one.
 */
export function preselectedFamily(field: ReviewField, families: ReadonlyArray<ReviewFamily>): string | null {
  const holding = families.filter((family) => comparableValue(field, family[field]) !== null);
  holding.sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || time(b.createdAt) - time(a.createdAt) || (a.id < b.id ? -1 : 1));
  return holding[0]?.id ?? null;
}

/** One field in disagreement: each family's value, side by side, and the one pre-selected. */
export interface ReviewDisagreement {
  field: ReviewField;
  /** Families holding a value, in the order given; the others have none. */
  values: Array<{ productId: string; value: unknown }>;
  preselectedProductId: string;
}

/** FEAT-102 c1: only the fields where at least two families hold different values. */
export function findDisagreements(families: ReadonlyArray<ReviewFamily>): ReviewDisagreement[] {
  return REVIEW_FIELDS.flatMap((field) => {
    const values = families.filter((family) => comparableValue(field, family[field]) !== null);
    if (new Set(values.map((family) => comparableValue(field, family[field]))).size < 2) return [];
    return [{
      field,
      values: values.map((family) => ({ productId: family.id, value: family[field] })),
      preselectedProductId: preselectedFamily(field, families) as string,
    }];
  });
}

/**
 * "À regrouper ?" cases from the families of a few product keys, as lists of
 * ids. Families are walked by creation date then id; each joins the first
 * case of its key holding no family it was declared different from ("C'est
 * un autre vin", `ProductDistinction`), else opens one. Only cases of two
 * families or more are proposed: two families declared different are never
 * proposed together, and once a case is settled the others can meet.
 */
export function formMergeCases(
  families: ReadonlyArray<{ id: string; key: string; createdAt: Date | string }>,
  distinctions: ReadonlyArray<readonly [string, string]>,
): string[][] {
  const apart = new Set(distinctions.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const walk = [...families].sort((a, b) => time(a.createdAt) - time(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cases: Array<{ key: string; ids: string[] }> = [];
  for (const family of walk) {
    const target = cases.find((c) => c.key === family.key && c.ids.every((id) => !apart.has(`${id}|${family.id}`)));
    if (target) target.ids.push(family.id);
    else cases.push({ key: family.key, ids: [family.id] });
  }
  return cases.filter((c) => c.ids.length > 1).map((c) => c.ids);
}

/** A unit as the fusion of identical groups reads it. */
export interface FusionUnit extends GroupKeyFields {
  id: string;
  estimatedValue: number | null;
  purchasePlace: string | null;
  location: string | null;
  quantity: number | null;
  isOpened: boolean;
  fillLevel: number | null;
  cigarsLeft: number | null;
  writtenOffAt: Date | string | null;
  deletedAt: Date | string | null;
  needsReview: boolean;
  slotColumn: number | null;
  slotRow: number | null;
  createdAt: Date | string;
  /** The inventory sessions it is counted in. */
  sessionIds: string[];
}

/** Groups that fuse: the oldest survives and holds the sum of their counts. */
export interface FusedGroup {
  survivorId: string;
  absorbedIds: string[];
  quantity: number;
  /** The first place of purchase and location given, oldest first. */
  purchasePlace: string | null;
  location: string | null;
}

const blank = (value: string | null) => (value === null ? null : normalizeText(value));

/**
 * Design.md rule 4: two groups may join only if their places of purchase,
 * and their locations, agree — normalised as {@link planGroupFusion}
 * compares them, an empty one agreeing with anything.
 */
export function placesAgree(
  a: { purchasePlace: string | null; location: string | null },
  b: { purchasePlace: string | null; location: string | null },
): boolean {
  const agree = (x: string | null, y: string | null) => x === null || y === null || x === y;
  return agree(blank(a.purchasePlace), blank(b.purchasePlace)) && agree(blank(a.location), blank(b.location));
}

/**
 * Design.md rule 4 (D5), as the families_transform migration applies it:
 * groups of a family that are identical — intact, out of the trash, not
 * written off, same `groupKey` and the same estimated value (empty equals
 * empty only: an empty value falls back on the price and the total value
 * would change) — fuse into the oldest, unless their place of purchase or
 * location disagree with what the group has gathered (empty agrees). Never
 * fused: a guessed group (`needsReview`, to review as it is), a group holding
 * a slot of the cellar plan (one slot per group until FEAT-93), two groups
 * counted in the same inventory session (one entry per unit), and a group
 * without a purchase day (its spending is dated by its creation, which the
 * survivor would not keep; the transformation always sets the day).
 * Walked by creation date then id, as the migration does.
 */
export function planGroupFusion(units: ReadonlyArray<FusionUnit>, kind: UnitKind): FusedGroup[] {
  const candidates = units
    // Without a purchase day, the budget falls back on each group's creation
    // day: fusing two of them could move a spending to another period.
    .filter((unit) => isGroupableItem(unit) && !unit.needsReview && unit.slotColumn === null && unit.slotRow === null
      && unit.purchasedAt !== null)
    .sort((a, b) => time(a.createdAt) - time(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const groups: Array<{ key: string; members: FusionUnit[]; place: string | null; location: string | null; sessions: Set<string> }> = [];
  for (const unit of candidates) {
    const key = JSON.stringify([groupKey(unit, kind), unit.estimatedValue]);
    const place = blank(unit.purchasePlace);
    const location = blank(unit.location);
    const target = groups.find((group) => group.key === key
      && (group.place === null || place === null || group.place === place)
      && (group.location === null || location === null || group.location === location)
      && unit.sessionIds.every((session) => !group.sessions.has(session)));
    if (!target) {
      groups.push({ key, members: [unit], place, location, sessions: new Set(unit.sessionIds) });
      continue;
    }
    target.members.push(unit);
    target.place ??= place;
    target.location ??= location;
    for (const session of unit.sessionIds) target.sessions.add(session);
  }

  const firstGiven = (members: FusionUnit[], field: 'purchasePlace' | 'location') =>
    members.find((member) => blank(member[field]) !== null)?.[field] ?? null;
  return groups.filter((group) => group.members.length > 1).map(({ members }) => ({
    survivorId: members[0].id,
    absorbedIds: members.slice(1).map((member) => member.id),
    quantity: members.reduce((sum, member) => sum + (member.quantity ?? 1), 0),
    purchasePlace: firstGiven(members, 'purchasePlace'),
    location: firstGiven(members, 'location'),
  }));
}

/** An "À regrouper ?" case: the families side by side and their disagreements. */
export interface ReviewMergeCase {
  /** The families, oldest first, each with its units in stock (its card). */
  products: ProductView[];
  /** Only the fields in disagreement (none when the families merely share the key). */
  disagreements: ReviewDisagreement[];
  /** Units in stock of all of them — what the merged card holds ("2 vins → 1 vin, 8 bouteilles"). */
  units: number;
}

/**
 * A guessed number (`needsReview`, decision #471 point 55): the group the
 * transformation formed with N−1 full bottles, and the opened or finished
 * bottle split off it (its sub-records).
 */
export interface ReviewCountCase {
  product: ProductView;
  group: ItemView;
  subRecords: ItemView[];
}

/** GET /api/products/review: empty lists when there is nothing to review (FEAT-102 c5). */
export interface ReviewList {
  merges: ReviewMergeCase[];
  counts: ReviewCountCase[];
}

/** Families one merge or one "keep apart" may name. */
export const MAX_REVIEW_FAMILIES = 20;

/**
 * POST /api/products/merge: the families of one wine to merge, and per field
 * the family whose value is kept — a field left out keeps the pre-selected
 * value when the families disagree on it (point 40), else the value they share.
 */
export interface MergeRequest {
  productIds: string[];
  choices?: Partial<Record<ReviewField, string>>;
}

/**
 * The description form's limits (api/src/schemas/inventory.schema.ts): a merge
 * may exceed them; the legacy label is cut to fit, notes and tags are kept whole.
 */
export const DESCRIPTION_LIMITS = { collection: 200, notes: 2000, tags: 20 } as const;

/** The merged family's notes or tags exceed the form's limits: the member must shorten them before saving the description. */
export interface MergeOverLimits {
  notes: boolean;
  tags: boolean;
}

/** Answer of a merge: the surviving family, and what the merge removed. */
export interface MergeResult {
  data: ProductView;
  overLimits: MergeOverLimits;
  removedProductIds: string[];
  /** Groups fused into an identical one of the merged family. */
  removedItemIds: string[];
}
