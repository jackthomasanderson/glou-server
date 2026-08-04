'use client';
import React from 'react';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';
import { InventoryCard } from './InventoryCard';
import { PaginationBar } from '@/components/ui/PaginationBar';

export interface InventoryGridViewProps {
  /** Already-paginated slice of `filteredItems` to render this page. */
  items: InventoryItem[];
  cellars?: Cellar[];
  categoryLabel: (category: string) => string;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onView: (item: InventoryItem) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  bulkMode: boolean;
  selectedIds: Set<string>;
  anchorId: string | null;
  onSelectToggle: (item: InventoryItem, event?: React.MouseEvent) => void;
  pendingSyncItemIds: Set<string>;

  page: number;
  totalPages: number;
  totalItems: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

/** Grid (card) rendering of the current inventory page, plus its pagination bar. */
export function InventoryGridView({
  items,
  cellars,
  categoryLabel,
  onEdit,
  onDelete,
  onView,
  t,
  bulkMode,
  selectedIds,
  anchorId,
  onSelectToggle,
  pendingSyncItemIds,
  page,
  totalPages,
  totalItems,
  setCurrentPage,
}: InventoryGridViewProps) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {items.map((item: InventoryItem) => (
          <InventoryCard
            key={item.id}
            item={item}
            categoryLabel={categoryLabel(item.category)}
            cellarName={cellars?.find((c: Cellar) => c.id === item.cellarId)?.name}
            onEdit={onEdit}
            onDelete={onDelete}
            onView={bulkMode ? undefined : onView}
            t={t}
            isSelected={selectedIds.has(item.id)}
            isAnchor={item.id === anchorId}
            onSelectToggle={bulkMode ? onSelectToggle : undefined}
            hasPendingSync={pendingSyncItemIds.has(item.id)}
          />
        ))}
      </div>
      <PaginationBar
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
        onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        labelPage={t('pagination.page')}
        labelOf={t('pagination.of')}
        labelItems={t('pagination.items')}
      />
    </>
  );
}
