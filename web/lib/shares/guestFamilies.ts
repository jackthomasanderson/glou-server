import { openableGroups } from '@shared/stock-choice';
import { isIntactItem, itemUnits, itemValue, unitKind, type UnitKind } from '@shared/units';
import type { InventoryCategory } from '@shared/inventory';
import type { ProductItem } from '@/lib/products/types';
import type { GuestItem } from './types';

// #471 (FEAT-109, ux-ui.md §10.9): the guest showcase shows wines (families)
// and their bottles in the shared scope, with the card line and the lines of
// a member's drawer. Pure: the page renders it, the tests read it.

/** A wine of the showcase: its description (read on any of its copies) and its copies in stock in the scope. */
export interface GuestFamily {
  productId: string;
  kind: UnitKind;
  category: InventoryCategory;
  name: string;
  producer: string;
  vintage: number | null;
  region: string | null;
  photoUrl: string | null;
  notes: string | null;
  /** Value of the copies in stock, null when the share hides prices or none is known. */
  value: number | null;
  items: ProductItem[];
}

/**
 * A guest copy read as a line of the families contract (`ProductItem`), so
 * the member's line wording and group choice apply as they are. What the
 * share does not give is empty; the showcase lists copies in stock only.
 */
export function toProductItem(item: GuestItem): ProductItem {
  return {
    id: item.id,
    productId: item.productId,
    userId: '',
    updatedBy: null,
    cellarId: item.cellarId ?? null,
    // A guest sees no plan (FEAT-93).
    slots: [],
    location: item.location ?? null,
    purchasePrice: item.purchasePrice ?? null,
    estimatedValue: item.estimatedValue ?? null,
    purchasePlace: null,
    // A `YYYY-MM-DD` day (D6), never a local Date.
    purchasedAt: item.purchasedAt ? item.purchasedAt.slice(0, 10) : null,
    bottleSize: item.bottleSize ?? null,
    quantity: item.quantity,
    cigarsPerBox: item.cigarsPerBox ?? null,
    cigarsLeft: item.cigarsLeft ?? null,
    isOpened: item.isOpened,
    fillLevel: item.fillLevel ?? null,
    openedAt: item.openedAt ?? null,
    parentItemId: null,
    writtenOffAt: null,
    needsReview: false,
    fieldSources: null,
    deletedAt: null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** The showcase's copies grouped by wine, in the order of their first copy. */
export function guestFamilies(items: readonly GuestItem[]): GuestFamily[] {
  const families = new Map<string, GuestFamily>();
  for (const item of items) {
    const key = item.productId ?? item.id;
    let family = families.get(key);
    if (!family) {
      const category = item.category as InventoryCategory;
      family = {
        productId: key,
        kind: unitKind(category),
        category,
        name: item.name,
        producer: item.producer,
        vintage: item.vintage ?? null,
        region: item.region ?? null,
        photoUrl: item.photoUrl ?? null,
        notes: item.notes ?? null,
        value: null,
        items: [],
      };
      families.set(key, family);
    }
    const unit = toProductItem(item);
    family.items.push(unit);
    // The value rule (#594): estimated value, else purchase price, of each copy in stock.
    if (unit.estimatedValue != null || unit.purchasePrice != null) family.value = (family.value ?? 0) + itemValue(unit);
  }
  return [...families.values()];
}

const inWriteCellar = (writeCellarIds: readonly string[]) => (item: ProductItem) =>
  item.cellarId != null && writeCellarIds.includes(item.cellarId);

/**
 * The lines a guest may take a copy from (open, drink, smoke): full lines of
 * the cellars shared with write access only (FEAT-109: the choice of the
 * line never offers another cellar).
 */
export const guestOpenableGroups = (family: Pick<GuestFamily, 'items'>, writeCellarIds: readonly string[]) =>
  openableGroups(family.items.filter(inWriteCellar(writeCellarIds)));

/** An opened copy of a write cellar: the guest sets its level, drinks or smokes from it. */
export const guestCanTouch = (item: ProductItem, writeCellarIds: readonly string[]) =>
  inWriteCellar(writeCellarIds)(item) && !isIntactItem(item) && itemUnits(item) > 0;
