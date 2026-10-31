'use client';
import React from 'react';
import { Button, Chip } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { useInventoryTrash, useRestoreInventoryItem } from '@/hooks/useInventory';
import { useProductsTrash, useRestoreProduct } from '@/hooks/useProducts';
import { itemUnits, unitKind } from '@shared/units';
import type { TrashedProduct } from '@/lib/products/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { InventoryListRowSkeleton } from './InventoryListRow';
import { TRASH_RETENTION_DAYS } from '@shared/inventory';

interface InventoryTrashProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  lockedCategories?: string[];
}

// The trash list endpoint doesn't carry a precomputed countdown (only the
// single-item delete response does, for the undo toast), so it's recomputed
// here from the `deletedAt` every trashed item already has.
function daysLeft(deletedAt: string): number {
  const expiresAt = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

// ISSUE_072: the trash route/service/client/hook already existed end to end
// (listTrash, restore) but no screen called useInventoryTrash — deleted
// items were recoverable for 7 days with no way to see or reach them.
export function InventoryTrash({ t, lockedCategories }: InventoryTrashProps) {
  const { data: items, isLoading, isError, refetch, isRefetching } = useInventoryTrash();
  const winesTrash = useProductsTrash();
  const restoreMutation = useRestoreInventoryItem();
  const restoreWineMutation = useRestoreProduct();

  const inScope = (category: string) => !lockedCategories || lockedCategories.includes(category);
  // #471 (D10): a wine thrown away is listed once, with the bottles that went
  // with it (same `deletedAt`); restoring it brings them back.
  const wines = (winesTrash.data ?? []).filter((wine) => inScope(wine.category));
  const trashedWith = new Map(wines.map((wine) => [wine.id, wine.deletedAt]));
  const visibleItems = (items ?? []).filter(
    (item) => inScope(item.category) && !(item.productId && trashedWith.get(item.productId) === item.deletedAt)
  );
  const unitsOf = (wine: TrashedProduct) =>
    wine.items.reduce((sum, unit) => sum + itemUnits(unit), 0);

  if (isLoading || winesTrash.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => <InventoryListRowSkeleton key={i} />)}
      </div>
    );
  }

  if (isError || winesTrash.isError) {
    return (
      <ErrorState
        message={t('inventory.errors.load')}
        onRetry={() => { void refetch(); void winesTrash.refetch(); }}
        isRetrying={isRefetching || winesTrash.isRefetching}
      />
    );
  }

  if (visibleItems.length === 0 && wines.length === 0) {
    return (
      <EmptyState
        icon={<Trash2 size={48} className="text-default-300" />}
        title={t('inventory.trashEmpty')}
      />
    );
  }

  const both = wines.length > 0 && visibleItems.length > 0;
  return (
    <div className="flex flex-col gap-4">
    {wines.length > 0 && (
      <section aria-label={t('familyList.trash.wines')}>
        {both && <h2 className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">{t('familyList.trash.wines')}</h2>}
        <ul className="flex flex-col gap-2" data-testid="trash-wines">
          {wines.map((wine) => {
            const units = unitsOf(wine);
            const cigars = unitKind(wine.category) === 'cigar';
            return (
              <li key={wine.id} className="flex items-center justify-between gap-3 bg-content1 border border-divider rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {[wine.producer, wine.name].filter(Boolean).join(' — ')}
                      {wine.vintage ? ` (${wine.vintage})` : ''}
                    </p>
                    <Chip size="sm" variant="flat">{t(`categories.${wine.category}`)}</Chip>
                  </div>
                  <p className="text-xs text-foreground-400">
                    {units > 0 && `${t(cigars ? 'familyList.trash.withCigars' : 'familyList.trash.withBottles', { count: units })} · `}
                    {t('inventory.trashDaysLeft', { count: daysLeft(wine.deletedAt) })}
                  </p>
                </div>
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  isLoading={restoreWineMutation.isPending && restoreWineMutation.variables === wine.id}
                  onPress={() => restoreWineMutation.mutate(wine.id)}
                >
                  {t('familyList.trash.restore')}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    )}
    {visibleItems.length > 0 && (
    <section aria-label={t('familyList.trash.bottles')}>
    {both && <h2 className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">{t('familyList.trash.bottles')}</h2>}
    <ul className="flex flex-col gap-2">
      {visibleItems.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-3 bg-content1 border border-divider rounded-xl px-4 py-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">
                {[item.producer, item.name].filter(Boolean).join(' — ')}
                {item.vintage ? ` (${item.vintage})` : ''}
              </p>
              <Chip size="sm" variant="flat">{t(`categories.${item.category}`)}</Chip>
            </div>
            {item.deletedAt && (
              <p className="text-xs text-foreground-400">
                {t('inventory.trashDaysLeft', { count: daysLeft(item.deletedAt) })}
              </p>
            )}
          </div>
          <Button
            size="sm"
            color="primary"
            variant="flat"
            isLoading={restoreMutation.isPending && restoreMutation.variables === item.id}
            onPress={() => restoreMutation.mutate(item.id)}
          >
            {t('inventory.restore')}
          </Button>
        </li>
      ))}
    </ul>
    </section>
    )}
    </div>
  );
}
