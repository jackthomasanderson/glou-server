import type { Prisma } from '@prisma/client';

/**
 * #471 (FEAT-92/94): the input fields that belong to the family (`Product`)
 * rather than to its physical units (`InventoryItem`) — design.md, "Où vit une
 * donnée" (decisions D1/D19): the whole description, technical sheet and
 * legacy `collection` label included, plus what is true of every bottle of
 * the wine (drinking window, alerts, reminder, photo, notes, tags).
 *
 * Bookkeeping columns (`lockedFields`, `fieldSources`, `updatedBy`, `userId`,
 * `deletedAt`) are written by the services themselves, never copied from an
 * input. The families_expand migration copies exactly these columns; a test
 * keeps the two lists equal.
 */
export const PRODUCT_FIELDS = [
  'category', 'name', 'producer', 'collection', 'tags', 'photoUrl', 'notes',
  // Wine & Sparkling
  'vintage', 'color', 'region', 'grapeVarieties', 'alcoholDegree', 'needsAeration', 'serviceTemp',
  'lotNumber', 'batchDate', 'appellation', 'classification',
  'sparklingType', 'sugarLevel', 'disgorgingDate', 'baseYear',
  // Spirit
  'spiritType', 'edition', 'declaredAge', 'caskType', 'additions', 'aromaticProfile',
  'isSingleCask', 'caskNumber', 'caskProof',
  // Cigar
  'format', 'manufactureYear', 'leafOrigin', 'factoryCode', 'recommendedHumidity', 'humidificationSystem',
  // Drinking window, alerts, reminder
  'peakMaturityFrom', 'peakMaturityTo', 'curveShape', 'alertsPaused', 'consumptionPostponedUntil',
  'reminderDate', 'alertStatus',
] as const satisfies readonly Prisma.ProductScalarFieldEnum[];

export type ProductField = (typeof PRODUCT_FIELDS)[number];

const PRODUCT_FIELD_SET: ReadonlySet<string> = new Set(PRODUCT_FIELDS);

export const isProductField = (field: string): field is ProductField => PRODUCT_FIELD_SET.has(field);

/** The family fields present in `data` (an explicit `null` is kept, `undefined` dropped). */
export function pickProductFields<T extends object>(data: T): Partial<Pick<T, Extract<keyof T, ProductField>>> {
  return Object.fromEntries(
    Object.entries(data).filter(([field, value]) => value !== undefined && isProductField(field)),
  ) as Partial<Pick<T, Extract<keyof T, ProductField>>>;
}

/**
 * D6: default purchase day of a new unit — today in the API's time zone
 * (`TZ`), as midnight UTC, which is how Prisma stores a `@db.Date` day.
 */
export function todayAsPurchaseDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
