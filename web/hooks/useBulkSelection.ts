'use client';
import React, { useCallback, useState } from 'react';
import { InventoryItem } from '@/lib/inventory/types';

export interface UseBulkSelectionResult {
  bulkMode: boolean;
  setBulkMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  anchorId: string | null;
  setAnchorId: React.Dispatch<React.SetStateAction<string | null>>;
  toggleBulkMode: () => void;
  /** Shift-click range selection. Uses `filteredItems` (not the paginated
   * slice) to compute the range, exactly like the original inline handler. */
  handleSelectToggle: (item: InventoryItem, event?: React.MouseEvent) => void;
  /** Clears the selection + anchor without touching `bulkMode` — used after
   * a successful bulk apply. */
  clearSelection: () => void;
}

/**
 * Owns the bulk-selection primitives: `bulkMode`/`selectedIds`/`anchorId`
 * plus `toggleBulkMode` and the shift-click range-select handler.
 * `InventoryBulkBar` (extracted in the first refactor pass) still receives
 * `bulkMode`/`selectedIds` as plain props from InventoryDashboard — this
 * hook just moves where those values are computed, the wiring into
 * `InventoryBulkBar` is unchanged.
 */
export function useBulkSelection(filteredItems: InventoryItem[]): UseBulkSelectionResult {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const toggleBulkMode = useCallback(() => {
    setBulkMode((prev) => !prev);
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const handleSelectToggle = useCallback(
    (item: InventoryItem, event?: React.MouseEvent) => {
      if (event?.shiftKey && anchorId) {
        const anchorIdx = filteredItems.findIndex((i) => i.id === anchorId);
        const targetIdx = filteredItems.findIndex((i) => i.id === item.id);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const [start, end] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
          const rangeIds = filteredItems.slice(start, end + 1).map((i) => i.id);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            rangeIds.forEach((id) => next.add(id));
            return next;
          });
          // NE PAS changer l'ancre sur un Shift+clic
        }
      } else {
        setAnchorId(item.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      }
    },
    [filteredItems, anchorId]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  return {
    bulkMode,
    setBulkMode,
    selectedIds,
    setSelectedIds,
    anchorId,
    setAnchorId,
    toggleBulkMode,
    handleSelectToggle,
    clearSelection,
  };
}
