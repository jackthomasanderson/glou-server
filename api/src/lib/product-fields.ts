import { Prisma, type Product } from '@prisma/client';
import type { PrismaClientOrTx } from './prisma';

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

/** What {@link writeProductFields} may write: family fields and the family's own bookkeeping. */
export type ProductWrite = Pick<Prisma.ProductUncheckedUpdateInput, ProductField | 'lockedFields' | 'fieldSources' | 'updatedBy'>;

// Built from the static PRODUCT_FIELDS list only — no input ever reaches it.
const MIRROR_ASSIGNMENTS = Prisma.raw(PRODUCT_FIELDS.map((field) => `"${field}" = p."${field}"`).join(', '));

/**
 * #471: the one way to write a family's fields. Writes `Product` (bumping its
 * `updatedAt`), then copies the family fields onto the transitional mirror
 * columns of every unit of the family, in SQL so that the units' `updatedAt`
 * stays untouched (D22: a description change must not put a pending offline
 * change of a unit in conflict). Pass a transaction client: both writes must
 * land together.
 */
export async function writeProductFields(client: PrismaClientOrTx, productId: string, data: ProductWrite): Promise<Product> {
  const product = await client.product.update({ where: { id: productId }, data });
  await client.$executeRaw`UPDATE "bottles" AS b SET ${MIRROR_ASSIGNMENTS} FROM "products" AS p WHERE p."id" = b."productId" AND b."productId" = ${productId}`;
  return product;
}

/** A unit row read with its family (and the family's collections, when included). */
export interface ItemWithProduct {
  lockedFields: string[];
  fieldSources: Prisma.JsonValue;
  product: Pick<Product, ProductField | 'lockedFields' | 'fieldSources'>;
}

/** The flat record `/api/inventory*` keeps serving: a unit with its family's description. */
export type FlatItemView<I extends ItemWithProduct> = Omit<I, 'product' | ProductField | 'fieldSources'>
  & Pick<I['product'], ProductField>
  & { fieldSources: Record<string, string> | null }
  & (I['product'] extends { collections: infer C } ? { collections: C } : unknown);

/** A `fieldSources` column (`Json?`, shape `{ [field]: source }`) as a plain map. */
export const fieldSourcesOf = (value: Prisma.JsonValue): Record<string, string> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string>) : {};

/**
 * #471: the flat view of a unit — the contract of `/api/inventory*` for the
 * readers not migrated to families yet. The description, its locks, its field
 * sources and its collections are read on the family (the source of truth),
 * the rest on the unit.
 */
export function toItemView<I extends ItemWithProduct>(item: I): FlatItemView<I> {
  const { product, ...unit } = item;
  const description = Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, product[field]]));
  const unitLocks = unit.lockedFields.filter((field) => !isProductField(field));
  const unitSources = Object.entries(fieldSourcesOf(unit.fieldSources)).filter(([field]) => !isProductField(field));
  const fieldSources = { ...Object.fromEntries(unitSources), ...fieldSourcesOf(product.fieldSources) };
  return {
    ...unit,
    ...description,
    lockedFields: [...new Set([...product.lockedFields, ...unitLocks])],
    fieldSources: Object.keys(fieldSources).length > 0 ? fieldSources : null,
    ...('collections' in product ? { collections: product.collections } : {}),
  } as unknown as FlatItemView<I>;
}
