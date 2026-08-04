'use client';
import { useCallback, useState } from 'react';
import { InventoryItem } from '@/lib/inventory/types';
import { findDuplicate } from '@/lib/inventory/duplicate';
import { useCreateInventoryItem, useUpdateInventoryItem } from '@/hooks/useInventory';

export interface UseDuplicateResolutionOptions {
  items?: InventoryItem[];
  createMutation: ReturnType<typeof useCreateInventoryItem>;
  updateMutation: ReturnType<typeof useUpdateInventoryItem>;
  syncCollections: (itemId: string, newCollectionIds: string[], oldCollectionIds: string[]) => Promise<void>;
  /** Called once the create/increment flow has fully settled (mirrors the
   * original `setMode('idle')` calls) — the dashboard owns `mode`, this hook
   * only owns the duplicate-dialog state. */
  onResolved: () => void;
}

export interface UseDuplicateResolutionResult {
  duplicateFound: InventoryItem | null;
  duplicateCandidate: Partial<InventoryItem> | null;
  /**
   * Submits a new-item creation. If `findDuplicate` matches an existing item,
   * opens the duplicate dialog instead of creating and returns without
   * calling `createMutation`. Otherwise creates immediately.
   */
  handleCreate: (values: Partial<InventoryItem>, collectionIds: string[]) => Promise<void>;
  handleDuplicateIncrement: () => void;
  handleDuplicateCreateAnyway: () => Promise<void>;
  handleDuplicateCancel: () => void;
}

/**
 * Encapsulates the "creating an item that looks like a duplicate" flow: the
 * `duplicateFound`/`duplicateCandidate`/`pendingCollectionIds` state plus the
 * three dialog actions (increment existing, create anyway, cancel). The
 * `<DuplicateDialog>` JSX itself stays in InventoryDashboard (it also needs
 * `cellars`/`t`, and keeping presentational JSX out of a state hook avoids
 * forcing this hook to know about rendering).
 */
export function useDuplicateResolution({
  items,
  createMutation,
  updateMutation,
  syncCollections,
  onResolved,
}: UseDuplicateResolutionOptions): UseDuplicateResolutionResult {
  const [duplicateFound, setDuplicateFound] = useState<InventoryItem | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<Partial<InventoryItem> | null>(null);
  const [pendingCollectionIds, setPendingCollectionIds] = useState<string[]>([]);

  const handleCreate = useCallback(
    async (values: Partial<InventoryItem>, collectionIds: string[]) => {
      const dup = findDuplicate(items ?? [], values);
      if (dup) {
        setDuplicateFound(dup);
        setDuplicateCandidate(values);
        setPendingCollectionIds(collectionIds);
        return;
      }
      const created = await createMutation.mutateAsync(values as InventoryItem);
      onResolved();
      if (collectionIds.length > 0) await syncCollections(created.id, collectionIds, []);
    },
    [createMutation, items, syncCollections, onResolved]
  );

  const handleDuplicateIncrement = useCallback(() => {
    if (!duplicateFound || !duplicateCandidate) return;
    const newQty = (duplicateFound.quantity ?? 1) + (duplicateCandidate.quantity ?? 1);
    updateMutation.mutate(
      { id: duplicateFound.id, patch: { quantity: newQty } },
      {
        onSettled: () => {
          onResolved();
          setDuplicateFound(null);
          setDuplicateCandidate(null);
          setPendingCollectionIds([]);
        },
      }
    );
  }, [duplicateFound, duplicateCandidate, updateMutation, onResolved]);

  const handleDuplicateCreateAnyway = useCallback(async () => {
    if (!duplicateCandidate) return;
    const collIds = pendingCollectionIds;
    setDuplicateFound(null);
    setDuplicateCandidate(null);
    setPendingCollectionIds([]);
    const created = await createMutation.mutateAsync(duplicateCandidate as InventoryItem);
    onResolved();
    if (collIds.length > 0) await syncCollections(created.id, collIds, []);
  }, [duplicateCandidate, pendingCollectionIds, createMutation, syncCollections, onResolved]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateFound(null);
    setDuplicateCandidate(null);
    setPendingCollectionIds([]);
  }, []);

  return {
    duplicateFound,
    duplicateCandidate,
    handleCreate,
    handleDuplicateIncrement,
    handleDuplicateCreateAnyway,
    handleDuplicateCancel,
  };
}
