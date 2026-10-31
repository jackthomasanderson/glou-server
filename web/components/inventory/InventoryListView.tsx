'use client';
import React, { useMemo } from 'react';
import { Table, TableHeader, TableColumn, TableBody } from '@heroui/react';
import type { Product } from '@/lib/products/types';
import { InventoryListRow } from './InventoryListRow';
import type { InventoryGridViewProps } from './InventoryGridView';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { mergePageSelection } from '@/lib/inventory/pageSelection';

interface ColDef {
  key: string;
  label: string;
  width?: number;
  className?: string;
}

export interface InventoryListViewProps extends Omit<InventoryGridViewProps, 'anchorId' | 'onSelectToggle'> {
  /** Replaces the bulk selection (the same one the card view edits). */
  onSelectedIdsChange: (ids: Set<string>) => void;
}

/** Table (list) rendering of the current inventory page, plus its pagination bar. */
export function InventoryListView({
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
  onSelectedIdsChange,
  pendingSyncIds,
  page,
  totalPages,
  totalItems,
  setCurrentPage,
}: InventoryListViewProps) {
  const tableColumns = useMemo<ColDef[]>(() => [
    { key: 'icon', label: ' ', width: 40 },
    { key: 'name', label: t('inventory.fields.name') },
    { key: 'producer', label: t('inventory.fields.producer'), className: 'hidden sm:table-cell' },
    { key: 'vintage', label: t('inventory.fields.vintage'), className: 'text-center' },
    { key: 'region', label: t('inventory.fields.region'), className: 'hidden md:table-cell' },
    { key: 'cellar', label: t('view.columns.cellar'), className: 'hidden md:table-cell' },
    { key: 'stock', label: t('familyList.stockColumn'), className: 'hidden sm:table-cell' },
    { key: 'peak', label: t('view.columns.peak'), className: 'text-center hidden sm:table-cell' },
    { key: 'status', label: t('view.columns.status'), className: 'hidden sm:table-cell' },
    { key: 'actions', label: t('admin.maturityRefs.columns.actions'), className: 'text-right' },
  ], [t]);

  return (
    <>
      {/* Selection mode uses the table's own selection, which draws the
          checkboxes and ticks a row on click. Rows hand-built with their own
          checkbox stayed as first drawn: the table reuses a row until its
          bottle, its columns or the selection mode change. No row action while
          selecting: with one, a click opens the row instead of ticking it as
          long as nothing is selected. */}
      <Table
        isCompact
        isStriped={false}
        shadow="none"
        radius="none"
        classNames={{ wrapper: 'border border-divider rounded-xl' }}
        aria-label={t('nav.bottles')}
        selectionMode={bulkMode ? 'multiple' : 'none'}
        color="primary"
        selectedKeys={selectedIds}
        onSelectionChange={(keys) =>
          onSelectedIdsChange(mergePageSelection(selectedIds, items.map((i) => i.id), keys))
        }
        onRowAction={bulkMode ? undefined : (key) => {
          const found = items.find((i) => i.id === String(key));
          if (!found || !isOpenable(found)) return;
          onView(found);
        }}
      >
        <TableHeader columns={tableColumns}>
          {(col) => (
            <TableColumn key={col.key} width={col.width} className={col.className}>
              {col.label}
            </TableColumn>
          )}
        </TableHeader>
        {/* #738: static rows, not the `items` render function. The table
            caches a row built from `items` by its bottle object and reuses it
            until that object changes, so what is computed beside the bottle
            (pending-sync icon, cellar name, category label after a language
            switch) stayed as first drawn. Static rows are rebuilt on every
            render. */}
        <TableBody>
          {items.map((item: Product) => React.cloneElement(
            InventoryListRow({
              item,
              stock: stockOf(item),
              categoryLabel: categoryLabel(item.category),
              cellarName: cellarNameOf(item),
              onEdit: isOpenable(item) ? onEdit : undefined,
              onDelete,
              t,
              hasPendingSync: pendingSyncIds.has(item.id),
            }),
            { key: item.id }
          ))}
        </TableBody>
      </Table>
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
