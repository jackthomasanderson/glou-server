import { Prisma, type Product } from '@prisma/client';
import type { PrismaClientOrTx } from './prisma';
import type { AlertStatus, FieldSource } from '../../../shared/inventory';
import type { ItemView } from '../../../shared/product';

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

/**
 * What {@link writeProductFields} may write: family fields and the family's
 * own bookkeeping. `updatedAt` only to carry it over in a maintenance pass.
 */
export type ProductWrite = Pick<
  Prisma.ProductUncheckedUpdateInput,
  ProductField | 'lockedFields' | 'fieldSources' | 'updatedBy' | 'updatedAt'
>;

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

/**
 * #471 (F2 review): serialises every write of a family's fields. Two members
 * changing the region and the colour through two sibling bottles, or each one
 * end of the drinking window, used to read the family outside the
 * transaction and recompute its locks, sources, window and alert from that
 * stale copy: one lock was lost, or the window ended up reversed. Call it in
 * the transaction, before reading the family.
 */
export async function lockFamily(client: PrismaClientOrTx, productId: string): Promise<void> {
  await client.$queryRaw`SELECT 1 FROM "products" WHERE "id" = ${productId} FOR UPDATE`;
}

/**
 * #471 (lock order, #787 review): the one order in which families are
 * locked — by code unit, the same everywhere, whatever the runtime's locale.
 */
export const compareFamilyIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * #471 (lock order, #787 review): locks every family of `productIds` once, in
 * {@link compareFamilyIds} order. A transaction that writes units of several
 * families calls it before its first write, so that two of them, or one and
 * a description write (family lock, then copy onto its units), never wait on
 * each other in a cycle (40P01).
 */
export async function lockFamilies(client: PrismaClientOrTx, productIds: Iterable<string>): Promise<void> {
  for (const productId of [...new Set(productIds)].sort(compareFamilyIds)) await lockFamily(client, productId);
}

/**
 * #471: the derived `alertStatus` of a family (and its mirror), written in
 * SQL so that no `updatedAt` moves — it changes with the calendar, not with
 * an edit, and must neither put a client's `expectedUpdatedAt` in conflict
 * nor carry back an `updatedAt` read earlier.
 */
export async function writeAlertStatus(client: PrismaClientOrTx, productId: string, status: AlertStatus): Promise<void> {
  await client.$executeRaw`UPDATE "products" SET "alertStatus" = ${status}::"AlertStatus" WHERE "id" = ${productId}`;
  await client.$executeRaw`UPDATE "bottles" SET "alertStatus" = ${status}::"AlertStatus" WHERE "productId" = ${productId}`;
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

/**
 * FEAT-05 bookkeeping of one table — the family or the unit, each for its
 * own fields (#471, D1), told apart by `belongs`: a manual edit locks the
 * touched fields and clears their stale non-manual source, `fieldSources`
 * tags the fields this call filled. Returns only the columns that change.
 */
export function nextLocksAndSources(
  current: { lockedFields: string[]; fieldSources: Prisma.JsonValue },
  belongs: (field: string) => boolean,
  options: { touched: string[]; fieldSources?: Partial<Record<string, FieldSource>>; isManualEdit: boolean; autoLock: boolean },
): { lockedFields?: string[]; fieldSources?: Record<string, string> } {
  const { fieldSources, isManualEdit, autoLock } = options;
  const touched = options.touched.filter(belongs);
  const result: { lockedFields?: string[]; fieldSources?: Record<string, string> } = {};

  if (autoLock) {
    const fieldsToLock = touched.filter((key) => !current.lockedFields.includes(key));
    if (fieldsToLock.length > 0) result.lockedFields = [...current.lockedFields, ...fieldsToLock];
  }

  const existingSources = fieldSourcesOf(current.fieldSources);
  const nextSources: Record<string, string> = { ...existingSources };
  for (const [key, source] of Object.entries(fieldSources ?? {})) {
    if (source && belongs(key)) nextSources[key] = source;
  }
  if (isManualEdit) {
    // A field the user just edited by hand reclaims 'manual' status — any
    // stale non-manual tag is cleared unless this very call re-tags it
    // (e.g. a future OCR confirmation step calling updateItem with both
    // isManualEdit: true and an explicit fieldSources entry).
    for (const key of touched) {
      if (!fieldSources || !(key in fieldSources)) delete nextSources[key];
    }
  }
  if (JSON.stringify(nextSources) !== JSON.stringify(existingSources)) result.fieldSources = nextSources;
  return result;
}

/** What {@link toUnitView} reads: a unit row, money columns as numbers or Decimals. */
export type UnitRow = Omit<ItemView, 'purchasedAt' | 'fieldSources' | 'purchasePrice' | 'estimatedValue'> & {
  purchasedAt: Date | null;
  fieldSources: Prisma.JsonValue;
  purchasePrice: number | Prisma.Decimal | null;
  estimatedValue: number | Prisma.Decimal | null;
};

/** The unit's own columns, exactly the {@link ItemView} contract (D9): no description, no locks. */
const ITEM_VIEW_FIELDS = [
  'id', 'productId', 'userId', 'updatedBy', 'cellarId', 'slotColumn', 'slotRow', 'location',
  'purchasePlace', 'bottleSize', 'quantity', 'cigarsPerBox', 'cigarsLeft', 'isOpened', 'fillLevel',
  'openedAt', 'parentItemId', 'writtenOffAt', 'needsReview', 'deletedAt', 'createdAt', 'updatedAt',
] as const satisfies readonly (keyof ItemView)[];

// The money extension (lib/prisma.ts) only reaches a unit read at the top
// level; a unit included under its family arrives as a Decimal.
const money = (value: number | Prisma.Decimal | null): number | null =>
  value === null ? null : typeof value === 'number' ? value : value.toNumber();

/**
 * #471 (D9): a unit as /api/products serves it — its own columns only. The
 * purchase day goes out as `YYYY-MM-DD` (D6), and `fieldSources` keeps the
 * unit's own fields (the mirror's tags belong to the family).
 */
export function toUnitView(row: UnitRow): ItemView {
  const unit = Object.fromEntries(ITEM_VIEW_FIELDS.map((field) => [field, row[field]])) as Pick<ItemView, (typeof ITEM_VIEW_FIELDS)[number]>;
  const sources = Object.entries(fieldSourcesOf(row.fieldSources)).filter(([field]) => !isProductField(field));
  return {
    ...unit,
    purchasePrice: money(row.purchasePrice),
    estimatedValue: money(row.estimatedValue),
    purchasedAt: row.purchasedAt ? row.purchasedAt.toISOString().slice(0, 10) : null,
    fieldSources: sources.length > 0 ? Object.fromEntries(sources) : null,
  };
}
