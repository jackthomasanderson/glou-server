'use client';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Button, Chip } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { useInventoryTrash, useRestoreInventoryItem } from '@/hooks/useInventory';
import { useProductsTrash, useRestoreProduct } from '@/hooks/useProducts';
import { isIntactItem, itemUnits, unitKind } from '@shared/units';
import type { TrashedProduct } from '@/lib/products/types';
import type { InventoryItem } from '@/lib/inventory/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { InventoryListRowSkeleton } from './InventoryListRow';
import { unitNoun } from '@/lib/products/stockActions';
import { useMe } from '@/hooks/useAuth';
import { useCellars } from '@/hooks/useCellars';
import { formatCurrency, formatDate } from '@/lib/format';
import { bottleLabel, formatPurchaseDay } from '@/lib/products/lines';
import type { ProductItem } from '@/lib/products/types';
import { useDeleteTrashedItem, useDeleteTrashedProduct, useEmptyTrash } from '@/hooks/usePermanentDelete';
import { OfflineBlockedButton, useOfflineBlocked } from '@/components/offline/OfflineBlockedButton';
import { CATEGORY_VALUES, TRASH_RETENTION_DAYS, type InventoryCategory } from '@shared/inventory';
import { TrashDeleteDialog } from './TrashDeleteDialog';

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

/** Copies of a line in the trash: a group's number, one for an opened bottle or box (recette #471). */
const lineCopies = (item: InventoryItem) =>
  isIntactItem({ isOpened: item.isOpened, fillLevel: item.fillLevel ?? null, cigarsLeft: item.cigarsLeft ?? null })
    ? Math.max(item.quantity ?? 1, 0)
    : 1;
const lineNoun = (item: InventoryItem) => unitNoun({ cigarsPerBox: item.cigarsPerBox ?? null }, unitKind(item.category));

// ISSUE_072: the trash route/service/client/hook already existed end to end
// (listTrash, restore) but no screen called useInventoryTrash — deleted
// items were recoverable for 7 days with no way to see or reach them.
export function InventoryTrash({ t, lockedCategories }: InventoryTrashProps) {
  const { data: items, isLoading, isError, error: loadError, refetch, isRefetching } = useInventoryTrash();
  const winesTrash = useProductsTrash();
  const restoreMutation = useRestoreInventoryItem();
  const restoreWineMutation = useRestoreProduct();
  // #962 (owner decision): deleting for good is for administrators only — the
  // API refuses the others (403); they restore, and are told the trash empties itself.
  const isAdmin = useMe().data?.isAdmin === true;
  const offline = useOfflineBlocked();
  const deleteItemMutation = useDeleteTrashedItem();
  const deleteWineMutation = useDeleteTrashedProduct();
  const emptyMutation = useEmptyTrash();
  const [pending, setPending] = useState<{ kind: 'wine' | 'item'; id: string } | { kind: 'empty' } | null>(null);
  const lang = useTranslation().i18n.language;
  const { data: cellars } = useCellars();
  const cellarName = useCallback((id: string) => cellars?.find((cellar) => cellar.id === id)?.name, [cellars]);
  // #844: which line it was, as the drawer says it — "Garage · 20 € / bouteille".
  // Not before the cellars are known: a line in a cellar would flash "Sans cave".
  const lineLabel = (item: InventoryItem) => cellars && bottleLabel(item as unknown as ProductItem, {
    kind: unitKind(item.category),
    t,
    cellarName,
    formatPrice: (value) => formatCurrency(value, lang),
    formatDay: (day) => formatPurchaseDay(day, lang),
    formatDate: (iso) => formatDate(iso, lang),
  });

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
  // #471 (recette v2): a box or a cigar thrown away is restored as such;
  // a line of several, in the plural (recette v3).
  const unitLabels = (item: InventoryItem) => {
    const noun = lineNoun(item);
    return { restore: t('inventory.restore', { context: noun === 'bottle' ? undefined : noun, count: lineCopies(item) }) };
  };

  if (isLoading || winesTrash.isLoading) {
    return (
      <LoadingRegion className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => <InventoryListRowSkeleton key={i} />)}
      </LoadingRegion>
    );
  }

  if (isError || winesTrash.isError) {
    return (
      <ErrorState
        error={loadError ?? winesTrash.error}
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

  // The headings follow the page: cigars, or bottles (review of #828).
  const page = !lockedCategories ? undefined : lockedCategories.every((category) => category === 'cigar') ? 'cigar' : 'bottle';
  const winesHeading = t('familyList.trash.wines', { context: page === 'cigar' ? 'cigar' : undefined });
  const linesHeading = t('familyList.trash.bottles', { context: page });

  // Named as listed: "Producer — Name (vintage)".
  const nameOf = (entry: { producer?: string | null; name?: string | null; vintage?: number | null }) =>
    [entry.producer, entry.name].filter(Boolean).join(' — ') + (entry.vintage ? ` (${entry.vintage})` : '');
  // A wine deleted for good takes all its bottles in the trash, those listed apart included.
  const wineUnits = (wine: TrashedProduct) =>
    unitsOf(wine) + visibleItems.filter((item) => item.productId === wine.id).reduce((sum, item) => sum + itemUnits({
      quantity: item.quantity ?? null, isOpened: item.isOpened, fillLevel: item.fillLevel ?? null,
      cigarsPerBox: item.cigarsPerBox ?? null, cigarsLeft: item.cigarsLeft ?? null, writtenOffAt: item.writtenOffAt ?? null,
    }), 0);
  const pageCategories: readonly InventoryCategory[] = (lockedCategories as InventoryCategory[] | undefined) ?? CATEGORY_VALUES;
  const confirmation = (() => {
    if (!pending) return null;
    const action = t('familyList.trash.deleteForever');
    if (pending.kind === 'empty') {
      return {
        title: t('familyList.trash.emptyTitle'),
        question: t('familyList.trash.emptyConfirm', { count: wines.length + visibleItems.length }),
        note: t('familyList.trash.irreversible'),
        action: t('familyList.trash.empty'),
      };
    }
    if (pending.kind === 'wine') {
      const wine = wines.find((entry) => entry.id === pending.id);
      if (!wine) return null;
      const units = wineUnits(wine);
      const key = units === 0 ? 'deleteForeverConfirm'
        : unitKind(wine.category) === 'cigar' ? 'deleteForeverConfirmCigars' : 'deleteForeverConfirmBottles';
      return {
        title: t('familyList.trash.deleteForeverTitle'),
        question: t(`familyList.trash.${key}`, { name: nameOf(wine), count: units }),
        note: t('familyList.trash.deleteForeverWineNote'),
        action,
      };
    }
    const item = visibleItems.find((entry) => entry.id === pending.id);
    if (!item) return null;
    return {
      title: t('familyList.trash.deleteForeverTitle'),
      question: t('familyList.trash.deleteForeverLine', {
        name: nameOf(item), what: t('familyList.trash.lineCount', { context: lineNoun(item), count: lineCopies(item) }),
      }),
      note: t('familyList.trash.irreversible'),
      action,
    };
  })();
  const close = () => setPending(null);
  const confirm = () => {
    if (!pending || offline) return;
    const options = { onSettled: close };
    if (pending.kind === 'empty') emptyMutation.mutate(pageCategories, options);
    else if (pending.kind === 'wine') deleteWineMutation.mutate(pending.id, options);
    else deleteItemMutation.mutate(pending.id, options);
  };
  const deleteButton = (target: { kind: 'wine' | 'item'; id: string }) => isAdmin && (
    <OfflineBlockedButton
      blocked={offline}
      size="sm"
      color="danger"
      variant="light"
      onPress={() => setPending(target)}
    >
      {t('familyList.trash.deleteForever')}
    </OfflineBlockedButton>
  );

  return (
    <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-foreground-500">{t('familyList.trash.autoDelete', { count: TRASH_RETENTION_DAYS })}</p>
      {isAdmin && (
        <OfflineBlockedButton blocked={offline} size="sm" color="danger" variant="light" className="ml-auto" onPress={() => setPending({ kind: 'empty' })}>
          {t('familyList.trash.empty')}
        </OfflineBlockedButton>
      )}
    </div>
    <TrashDeleteDialog
      confirmation={confirmation}
      onConfirm={confirm}
      onClose={close}
      isPending={emptyMutation.isPending || deleteWineMutation.isPending || deleteItemMutation.isPending}
      t={t}
    />
    {wines.length > 0 && (
      <section aria-label={winesHeading}>
        <h2 className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">{winesHeading}</h2>
        <ul className="flex flex-col gap-2" data-testid="trash-wines">
          {wines.map((wine) => {
            const units = unitsOf(wine);
            const cigars = unitKind(wine.category) === 'cigar';
            return (
              <li key={wine.id} className="flex flex-wrap items-center justify-between gap-3 bg-content1 border border-divider rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {[wine.producer, wine.name].filter(Boolean).join(' — ')}
                      {wine.vintage ? ` (${wine.vintage})` : ''}
                    </p>
                    <Chip size="sm" variant="flat">{t(`categories.${wine.category}`)}</Chip>
                  </div>
                  <p className="text-xs text-foreground-400">
                    {units > 0 && `${t('familyList.trash.lineCount', { context: cigars ? 'cigar' : 'bottle', count: units })} · `}
                    {t('inventory.trashDaysLeft', { count: daysLeft(wine.deletedAt) })}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2 ml-auto">
                  {deleteButton({ kind: 'wine', id: wine.id })}
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    isLoading={restoreWineMutation.isPending && restoreWineMutation.variables === wine.id}
                    onPress={() => restoreWineMutation.mutate(wine.id)}
                  >
                    {t('familyList.trash.restore')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    )}
    {visibleItems.length > 0 && (
    <section aria-label={linesHeading}>
    <h2 className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">{linesHeading}</h2>
    <ul className="flex flex-col gap-2">
      {visibleItems.map((item) => {
        const label = unitLabels(item);
        return (
        <li
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-3 bg-content1 border border-divider rounded-xl px-4 py-3"
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
                {/* #844: every line says how many and which one it was, a single bottle included. */}
                {`${[t('familyList.trash.lineCount', { context: lineNoun(item), count: lineCopies(item) }), lineLabel(item)].filter(Boolean).join(' · ')} · `}
                {t('inventory.trashDaysLeft', { count: daysLeft(item.deletedAt) })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 ml-auto">
            {deleteButton({ kind: 'item', id: item.id })}
            <Button
              size="sm"
              color="primary"
              variant="flat"
              isLoading={restoreMutation.isPending && restoreMutation.variables === item.id}
              onPress={() => restoreMutation.mutate(item.id)}
            >
              {label.restore}
            </Button>
          </div>
        </li>
        );
      })}
    </ul>
    </section>
    )}
    </div>
  );
}
