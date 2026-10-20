import type { InventoryItem } from './types';

/**
 * FEAT-87: an item is owned unless it is explicitly flagged as a non-owned
 * reference. `isOwned` is undefined on items served by an API older than the
 * field, and on locally-drafted items, so the absence means "owned" — the
 * same default the database column carries.
 */
export function isOwnedItem(item: Pick<InventoryItem, 'isOwned'>): boolean {
  return item.isOwned !== false;
}
