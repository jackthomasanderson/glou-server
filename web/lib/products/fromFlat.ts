import { isFinishedState, itemUnits } from '@shared/units';
import type { InventoryItem } from '@/lib/inventory/types';
import type { Product, ProductItem } from './types';

const UNIT_FIELDS = [
  'id', 'productId', 'userId', 'updatedBy', 'cellarId', 'slotColumn', 'slotRow', 'location',
  'purchasePrice', 'estimatedValue', 'purchasePlace', 'purchasedAt', 'bottleSize', 'quantity',
  'cigarsPerBox', 'cigarsLeft', 'isOpened', 'fillLevel', 'openedAt', 'parentItemId', 'writtenOffAt',
  'needsReview', 'fieldSources', 'deletedAt', 'createdAt', 'updatedAt',
] as const satisfies ReadonlyArray<keyof ProductItem>;

export type FlatItem = InventoryItem & Partial<Record<(typeof UNIT_FIELDS)[number], unknown>>;

export const inStock = (item: FlatItem) =>
  item.isOwned !== false && !item.deletedAt && !item.writtenOffAt && !isFinishedState({ isOpened: item.isOpened, fillLevel: item.fillLevel ?? null });

export function toUnit(item: FlatItem): ProductItem {
  const unit = Object.fromEntries(UNIT_FIELDS.map((field) => [field, item[field] ?? null]));
  return { ...unit, productId: item.productId ?? item.id, isOpened: item.isOpened, needsReview: Boolean(item.needsReview) } as ProductItem;
}

/**
 * FEAT-16/23 offline fallback: the wines rebuilt from the flat inventory last
 * mirrored to IndexedDB (`/api/products` cannot be reached). Each bottle
 * carries its wine's description and `productId`; a wine whose bottles are all
 * finished shows as "Plus en cave". Wines known without any bottle at all are
 * not in that copy: they come back with the network.
 */
export function productsFromFlatItems(items: readonly InventoryItem[]): Product[] {
  const families = new Map<string, { first: FlatItem; units: ProductItem[] }>();
  for (const item of items as readonly FlatItem[]) {
    if (item.deletedAt) continue;
    const key = item.productId ?? item.id;
    const family = families.get(key) ?? { first: item, units: [] };
    if (inStock(item)) family.units.push(toUnit(item));
    families.set(key, family);
  }
  return [...families.entries()].map(([id, { first, units }]) => {
    const description = Object.fromEntries(
      Object.entries(first).filter(([field]) => !(UNIT_FIELDS as readonly string[]).includes(field)),
    );
    return {
      ...description,
      id,
      otherPhotoUrls: [],
      collections: first.collections ?? [],
      readiness: first.readiness ?? null,
      lastActivityAt: null,
      createdAt: first.createdAt,
      updatedAt: first.updatedAt,
      deletedAt: null,
      items: units,
    } as unknown as Product;
  });
}

/** Fields of a wine that are not its description: never copied from a bottle. */
const NOT_DESCRIPTION = new Set([
  'id', 'userId', 'updatedBy', 'lockedFields', 'fieldSources', 'deletedAt', 'createdAt', 'updatedAt', 'lastActivityAt', 'items',
]);

/**
 * ISSUE_381: a bottle saved (form, drawer, offline queue) updates its wine's
 * card in place — its own line, and the description it carries — instead of
 * reloading every wine. A bottle no longer in stock leaves the card's units.
 */
export function withFlatItem(products: readonly Product[] | undefined, item: InventoryItem): Product[] | undefined {
  if (!products) return products;
  const flatItem = item as FlatItem;
  return products.map((product) => {
    const isOwn = product.id === flatItem.productId || product.items.some((unit) => unit.id === item.id);
    if (!isOwn) return product;
    const known = product.items.some((unit) => unit.id === item.id);
    const kept = inStock(flatItem);
    const items = known
      ? product.items.flatMap((unit) => (unit.id !== item.id ? [unit] : kept ? [toUnit(flatItem)] : []))
      : kept ? [...product.items, toUnit(flatItem)] : product.items;
    // A bottle just finished is the wine's latest activity (§10.5).
    const finished = isFinishedState({ isOpened: item.isOpened, fillLevel: item.fillLevel ?? null });
    const lastActivityAt = finished && (!product.lastActivityAt || item.updatedAt > product.lastActivityAt)
      ? item.updatedAt : product.lastActivityAt;
    const description = Object.fromEntries(
      Object.entries(item).filter(([field]) => field in product && !NOT_DESCRIPTION.has(field) && !(UNIT_FIELDS as readonly string[]).includes(field)),
    );
    return { ...product, ...description, lastActivityAt, items } as Product;
  });
}

/** A bottle trashed: it leaves its wine's card. */
export function withoutUnit(products: readonly Product[] | undefined, itemId: string): Product[] | undefined {
  if (!products) return products;
  return products.map((product) =>
    product.items.some((unit) => unit.id === itemId)
      ? { ...product, items: product.items.filter((unit) => unit.id !== itemId) }
      : product);
}

const unitInStock = (unit: ProductItem) => unit.deletedAt == null && itemUnits(unit) > 0;

/**
 * D8: the other bottles a write changed (`changed`: the group a bottle was
 * detached from, the group that absorbed it) and those it removed
 * (`removedIds`: a sub-record reattached), applied to the cached wines.
 */
export function withUnitChanges(
  products: readonly Product[] | undefined,
  changed: readonly ProductItem[],
  removedIds: readonly string[],
): Product[] | undefined {
  if (!products || (changed.length === 0 && removedIds.length === 0)) return products as Product[] | undefined;
  const byId = new Map(changed.map((unit) => [unit.id, unit]));
  const removed = new Set(removedIds);
  return products.map((product) => {
    const touched = product.items.some((unit) => byId.has(unit.id) || removed.has(unit.id))
      || changed.some((unit) => unit.productId === product.id);
    if (!touched) return product;
    const items = product.items
      .filter((unit) => !removed.has(unit.id))
      .flatMap((unit) => {
        const next = byId.get(unit.id);
        if (!next) return [unit];
        return unitInStock(next) ? [next] : [];
      });
    const known = new Set(items.map((unit) => unit.id));
    for (const unit of changed) {
      if (unit.productId === product.id && !known.has(unit.id) && !product.items.some((u) => u.id === unit.id) && unitInStock(unit)) {
        items.push(unit);
      }
    }
    return { ...product, items };
  });
}

/** The same changes on the flat list of bottles (still loaded by the page): no row left behind. */
export function flatWithUnitChanges(
  items: readonly InventoryItem[] | undefined,
  changed: readonly ProductItem[],
  removedIds: readonly string[],
): InventoryItem[] | undefined {
  if (!items || (changed.length === 0 && removedIds.length === 0)) return items as InventoryItem[] | undefined;
  const byId = new Map(changed.map((unit) => [unit.id, unit]));
  const removed = new Set(removedIds);
  return items
    .filter((item) => !removed.has(item.id))
    .map((item) => {
      const unit = byId.get(item.id);
      return unit ? ({ ...item, ...unit } as unknown as InventoryItem) : item;
    });
}
