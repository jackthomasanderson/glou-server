import { itemUnits } from '@shared/units';
import type { InventoryItem } from '@/lib/inventory/types';
import { toUnit } from '@/lib/products/fromFlat';

/**
 * #849: a row of `useInventory()` still in the cellar: not in the trash and
 * holding at least one unit (shared/units.ts `itemUnits`), so not drunk,
 * smoked to its last cigar or written off. What an action on a bottle (pair
 * it with a dish, find it during a count) may offer.
 */
export function isInStockItem(item: InventoryItem): boolean {
  return item.deletedAt == null && itemUnits(toUnit(item)) > 0;
}

/** The rows of `useInventory()` still in the cellar ({@link isInStockItem}). */
export function inStockItems(items: readonly InventoryItem[]): InventoryItem[] {
  return items.filter(isInStockItem);
}
