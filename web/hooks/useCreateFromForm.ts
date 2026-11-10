'use client';
import { useCallback } from 'react';
import { useCreateInventoryItem } from '@/hooks/useInventory';
import { useAddItemsToCollection } from '@/hooks/useCollections';
import { applyCollectionChanges } from '@/lib/collections/sync';
import type { InventoryEntry } from '@/components/inventory/InventoryForm';
import type { InventoryItem } from '@/lib/inventory/types';

/**
 * `scanJobId`: escape hatch mirrored on the server (inventory.router.ts's
 * POST /), read off the raw request body, not part of `inventoryInputSchema`.
 * It lets the server re-read the scan job's own extracted data and tag the
 * fields it really filled as 'ocr' (FEAT-05 provenance), never trusting a
 * client-supplied source map.
 */
export type FormEntryToCreate = InventoryEntry & { scanJobId?: string };

/**
 * The one rule for the cellar of a new entry: a cellar field left untouched
 * (`undefined`) gets the caller's cellar (the first-run wizard's, the
 * cellar page's); an explicit "No cellar" (`null`) is kept.
 */
export function withDefaultCellar<T extends InventoryEntry>(values: T, defaultCellarId?: string | null): T {
  return values.cellarId === undefined && defaultCellarId != null ? { ...values, cellarId: defaultCellarId } : values;
}

/**
 * #690: "save what the add form sent" — the inventory page, the scan, the
 * first-run wizard and the cellar page all create through this, so a rule
 * of the add path cannot drift between them again.
 *
 * `create` resolves with the item once it exists (`null` when the save
 * failed: the mutation's toast says so and the caller keeps its form open).
 * The collections picked in the form are then added without being waited
 * for: a failure there is told once by its own toast, and the item, already
 * saved, must not be entered a second time.
 */
export function useCreateFromForm({ defaultCellarId }: { defaultCellarId?: string | null } = {}) {
  const createItem = useCreateInventoryItem();
  const addItemsToCollection = useAddItemsToCollection();
  const { mutateAsync: createAsync } = createItem;
  const { mutateAsync: addAsync } = addItemsToCollection;

  const create = useCallback(
    async (values: FormEntryToCreate, collectionIds: string[] = []): Promise<InventoryItem | null> => {
      let created: InventoryItem;
      try {
        created = await createAsync(withDefaultCellar(values, defaultCellarId));
      } catch {
        // Reported by the mutation's onError toast.
        return null;
      }
      if (collectionIds.length > 0) {
        // A new item has no collection yet, so syncing is only ever adding.
        void applyCollectionChanges(collectionIds.map((id) => addAsync({ id, itemIds: [created.id] }))).catch(() => {
          // Reported once by applyCollectionChanges.
        });
      }
      return created;
    },
    [createAsync, addAsync, defaultCellarId],
  );

  return { create, isPending: createItem.isPending || addItemsToCollection.isPending };
}
