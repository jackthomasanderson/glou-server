'use client';
import React from 'react';
import type { Product } from '@/lib/products/types';
import type { StockLine } from '@/lib/products/stock';
import { InventoryCard } from './InventoryCard';
import { PaginationBar } from '@/components/ui/PaginationBar';

export interface InventoryGridViewProps {
  /** Already-paginated slice of the filtered wines to render this page. */
  items: Product[];
  /** The stock line of each wine (§10.2). */
  stockOf: (product: Product) => StockLine;
  /** The cellar a wine's bottles are all in; undefined when spread over several, or none. */
  cellarNameOf: (product: Product) => string | undefined;
  /** Whether the wine has a bottle record to edit; every wine opens its drawer. */
  isOpenable: (product: Product) => boolean;
  categoryLabel: (category: string) => string;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onView: (product: Product) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  bulkMode: boolean;
  selectedIds: Set<string>;
  anchorId: string | null;
  onSelectToggle: (product: Product, event?: React.MouseEvent) => void;
  /** Wines with a bottle change still waiting in the offline queue. */
  pendingSyncIds: Set<string>;

  page: number;
  totalPages: number;
  totalItems: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

/** Grid (card) rendering of the current page of wines, plus its pagination bar. */
export function InventoryGridView({
  items,
  stockOf,
  cellarNameOf,
  isOpenable,
  categoryLabel,
  onEdit,
  onDelete,
  onView,
  t,
  bulkMode,
  selectedIds,
  anchorId,
  onSelectToggle,
  pendingSyncIds,
  page,
  totalPages,
  totalItems,
  setCurrentPage,
}: InventoryGridViewProps) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 sm:gap-4">
        {items.map((product) => {
          const openable = isOpenable(product);
          return (
            <InventoryCard
              key={product.id}
              item={product}
              stock={stockOf(product)}
              categoryLabel={categoryLabel(product.category)}
              cellarName={cellarNameOf(product)}
              onEdit={openable ? onEdit : undefined}
              onDelete={onDelete}
              onView={bulkMode ? undefined : onView}
              t={t}
              isSelected={selectedIds.has(product.id)}
              isAnchor={product.id === anchorId}
              onSelectToggle={bulkMode ? onSelectToggle : undefined}
              hasPendingSync={pendingSyncIds.has(product.id)}
            />
          );
        })}
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
