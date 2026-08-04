'use client';
import React, { useMemo } from 'react';
import { Table, TableHeader, TableColumn, TableBody } from '@heroui/react';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';
import { InventoryListRow } from './InventoryListRow';
import { PaginationBar } from '@/components/ui/PaginationBar';

interface ColDef {
  key: string;
  label: string;
  width?: number;
  className?: string;
}

export interface InventoryListViewProps {
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

/** Table (list) rendering of the current inventory page, plus its pagination bar. */
export function InventoryListView({
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
}: InventoryListViewProps) {
  const tableColumns = useMemo<ColDef[]>(() => [
    { key: 'check', label: ' ', width: 40, className: bulkMode ? undefined : 'w-0 p-0' },
    { key: 'icon', label: ' ', width: 40 },
    { key: 'name', label: t('inventory.fields.name') },
    { key: 'producer', label: t('inventory.fields.producer'), className: 'hidden sm:table-cell' },
    { key: 'vintage', label: t('inventory.fields.vintage'), className: 'text-center' },
    { key: 'region', label: t('inventory.fields.region'), className: 'hidden md:table-cell' },
    { key: 'cellar', label: t('view.columns.cellar'), className: 'hidden md:table-cell' },
    { key: 'peak', label: t('view.columns.peak'), className: 'text-center hidden sm:table-cell' },
    { key: 'status', label: t('view.columns.status'), className: 'hidden sm:table-cell' },
    { key: 'actions', label: t('admin.maturityRefs.columns.actions'), className: 'text-right' },
  ], [bulkMode, t]);

  return (
    <>
      <Table
        isCompact
        isStriped={false}
        shadow="none"
        radius="none"
        classNames={{ wrapper: 'border border-divider rounded-xl' }}
        aria-label={t('nav.bottles')}
        onRowAction={(key) => {
          if (bulkMode) return;
          const found = items.find((i) => i.id === String(key));
          if (!found) return;
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
        <TableBody items={items}>
          {(item: InventoryItem) => React.cloneElement(
            InventoryListRow({
              item,
              categoryLabel: categoryLabel(item.category),
              cellar: cellars?.find((c: Cellar) => c.id === item.cellarId) ?? undefined,
              onEdit,
              onDelete,
              onView: bulkMode ? undefined : onView,
              t,
              isSelected: selectedIds.has(item.id),
              isAnchor: item.id === anchorId,
              onSelectToggle: bulkMode ? onSelectToggle : undefined,
              hasPendingSync: pendingSyncItemIds.has(item.id),
            }),
            { key: item.id }
          )}
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
