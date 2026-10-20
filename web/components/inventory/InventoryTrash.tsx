'use client';
import React from 'react';
import { Button, Chip } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { useInventoryTrash, useRestoreInventoryItem } from '@/hooks/useInventory';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { InventoryListRowSkeleton } from './InventoryListRow';

interface InventoryTrashProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  lockedCategories?: string[];
}

// Mirrors api/src/services/inventory.service.ts's TRASH_RETENTION_DAYS. The
// trash list endpoint doesn't carry a precomputed countdown (only the
// single-item delete response does, for the undo toast), so it's recomputed
// here from the `deletedAt` every trashed item already has.
const TRASH_RETENTION_DAYS = 7;

function daysLeft(deletedAt: string): number {
  const expiresAt = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

// ISSUE_072: the trash route/service/client/hook already existed end to end
// (listTrash, restore) but no screen called useInventoryTrash — deleted
// items were recoverable for 7 days with no way to see or reach them.
export function InventoryTrash({ t, lockedCategories }: InventoryTrashProps) {
  const { data: items, isLoading, isError, refetch, isRefetching } = useInventoryTrash();
  const restoreMutation = useRestoreInventoryItem();

  const visibleItems = (items ?? []).filter(
    (item) => !lockedCategories || lockedCategories.includes(item.category)
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => <InventoryListRowSkeleton key={i} />)}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={t('inventory.errors.load')}
        onRetry={() => { void refetch(); }}
        isRetrying={isRefetching}
      />
    );
  }

  if (visibleItems.length === 0) {
    return (
      <EmptyState
        icon={<Trash2 size={48} className="text-default-300" />}
        title={t('inventory.trashEmpty')}
      />
    );
  }

  return (
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
                {daysLeft(item.deletedAt)} {t('inventory.trashInfo')}
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
  );
}
