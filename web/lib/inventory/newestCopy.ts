import type { InventoryItem } from './types';

/**
 * The most recent of several copies of one bottle (#572). The edit form saves
 * against the version it opened with, so it must open with the latest one: a
 * copy handed over by a window that changed the bottle meanwhile (fill level,
 * quantity, rollback...) would make its save conflict with the user's own change.
 *
 * Newest `updatedAt` wins; on a tie, a later copy wins (an offline change sits
 * in the caches with the version it was queued against). A save's answer has
 * no collections, so they come from the newest copy that has them.
 */
export function newestCopy(
  given: InventoryItem,
  ...others: (InventoryItem | undefined)[]
): InventoryItem {
  const copies = [given, ...others.filter((c): c is InventoryItem => c?.id === given.id)];
  const newest = copies.reduce((best, c) => (c.updatedAt >= best.updatedAt ? c : best));
  if (newest.collections) return newest;
  const withCollections = [...copies].reverse().find((c) => c.collections);
  return withCollections ? { ...newest, collections: withCollections.collections } : newest;
}
