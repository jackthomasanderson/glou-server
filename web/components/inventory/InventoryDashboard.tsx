'use client';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Button, Chip,
  Table, TableHeader, TableColumn, TableBody,
} from '@heroui/react';
import { Plus, X, List, Search, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';
import {
  useInventory,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useRestoreInventoryItem,
  useBulkUpdateInventoryItem,
} from '@/hooks/useInventory';
import { useCellars } from '@/hooks/useCellars';
import { useCollections, useAddItemsToCollection, useRemoveItemFromCollection } from '@/hooks/useCollections';
import { InventoryCard, InventoryCardSkeleton } from './InventoryCard';
import { InventoryForm } from './InventoryForm';
import { UndoToast } from '@/components/ui/UndoToast';
import { BulkActionDialog } from './BulkActionDialog';
import { InventoryDetailDialog } from './InventoryDetailDialog';
import { InventoryListRow, InventoryListRowSkeleton } from './InventoryListRow';
import { InventoryFilterBar } from './InventoryFilterBar';
import { InventoryBulkBar } from './InventoryBulkBar';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { DuplicateDialog } from './DuplicateDialog';
import { findDuplicate } from '@/lib/inventory/duplicate';

type UIMode = 'idle' | 'creating' | 'editing';

interface InventoryDashboardProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  lockedCategories?: string[];
}

export function InventoryDashboard({ t, lockedCategories }: InventoryDashboardProps) {
  const { data: items, isLoading, isError } = useInventory();
  const { data: cellars } = useCellars();
  const { data: allCollections } = useCollections();
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const deleteMutation = useDeleteInventoryItem();
  const restoreMutation = useRestoreInventoryItem();
  const addItemsToCollectionMutation = useAddItemsToCollection();
  const removeItemFromCollectionMutation = useRemoveItemFromCollection();
  const hasMounted = useHasMounted();

  const [mode, setMode] = useState<UIMode>('idle');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);
  const [duplicateFound, setDuplicateFound] = useState<InventoryItem | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<Partial<InventoryItem> | null>(null);
  const [pendingCollectionIds, setPendingCollectionIds] = useState<string[]>([]);
  const [undoTarget, setUndoTarget] = useState<InventoryItem | null>(null);

  const bulkUpdateMutation = useBulkUpdateInventoryItem();
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkSuccessCount, setBulkSuccessCount] = useState<number | null>(null);

  const handleSelectToggle = useCallback((item: InventoryItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCellars, setSelectedCellars] = useState<string[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'value' | 'urgency' | 'name'>('default');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [openedFilter, setOpenedFilter] = useState<'all' | 'full' | 'opened' | 'alerts'>('all');

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    const qParam = searchParams.get('q');
    const collectionParam = searchParams.get('collection');
    const scanParam = searchParams.get('scan');
    if (qParam) setSearchQuery(qParam);
    setSelectedCollectionId(collectionParam ?? null);
    if (filterParam === 'opened') {
      setOpenedFilter('opened'); setIsFiltersOpen(true);
    } else if (filterParam === 'full') {
      setOpenedFilter('full'); setIsFiltersOpen(true);
    } else if (filterParam === 'alerts') {
      setOpenedFilter('alerts'); setIsFiltersOpen(true);
    } else {
      setOpenedFilter('all');
    }
    // Auto-open bottle from QR scan (FEAT-10)
    if (scanParam && items) {
      const found = items.find((i) => i.id === scanParam);
      if (found) {
        setViewingItem(found);
        // Remove ?scan= from URL to avoid reopening on refresh
        const next = new URLSearchParams(searchParams.toString());
        next.delete('scan');
        router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
      }
    }
  }, [searchParams, items]);

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode('inventory');

  // Detect mobile via CSS (no MUI hook needed)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveViewMode = isMobile ? 'grid' : viewMode;

  const toggleFilters = useCallback(() => setIsFiltersOpen((prev) => !prev), []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategories([]);
    setSelectedCellars([]);
    setSelectedTags([]);
    setMinValue('');
    setMaxValue('');
    setSortBy('default');
    setOpenedFilter('all');
    router.push(pathname);
  }, [router, pathname]);

  const allTags = useMemo(() => {
    if (!items) return [];
    const set = new Set<string>();
    items.forEach((b: InventoryItem) => (b.tags || []).forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [items]);

  const baseItems = useMemo(() => {
    if (!items) return [];
    if (lockedCategories && lockedCategories.length > 0) {
      return items.filter((b: InventoryItem) => lockedCategories.includes(b.category));
    }
    return items;
  }, [items, lockedCategories]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let result = items;
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    if (lockedCategories && lockedCategories.length > 0) {
      result = result.filter((b: InventoryItem) => lockedCategories.includes(b.category));
    }
    if (selectedCollectionId) {
      result = result.filter((b: InventoryItem) =>
        (b.collections ?? []).some(c => c.id === selectedCollectionId)
      );
    }
    if (selectedCategories.length > 0) {
      result = result.filter((b: InventoryItem) => selectedCategories.includes(b.category));
    }
    if (selectedCellars.length > 0) {
      result = result.filter((b: InventoryItem) => selectedCellars.includes(b.cellarId || ''));
    }
    if (selectedTags.length > 0) {
      result = result.filter((b: InventoryItem) =>
        selectedTags.every((tag) => (b.tags || []).includes(tag))
      );
    }
    if (minValue !== '') {
      const min = parseFloat(minValue);
      if (!isNaN(min)) {
        result = result.filter((b: InventoryItem) => {
          const v = b.estimatedValue ?? b.purchasePrice ?? 0;
          return v >= min;
        });
      }
    }
    if (maxValue !== '') {
      const max = parseFloat(maxValue);
      if (!isNaN(max)) {
        result = result.filter((b: InventoryItem) => {
          const v = b.estimatedValue ?? b.purchasePrice ?? 0;
          return v <= max;
        });
      }
    }
    if (openedFilter === 'full') {
      result = result.filter((b: InventoryItem) => !b.isOpened);
    } else if (openedFilter === 'opened') {
      result = result.filter((b: InventoryItem) => b.isOpened);
    } else if (openedFilter === 'alerts') {
      if (!hasMounted) return [];
      const today = new Date().toISOString().split('T')[0];
      result = result.filter((b: InventoryItem) =>
        (b.reminderDate && b.reminderDate.split('T')[0] <= today) ||
        (b.alertStatus && b.alertStatus !== 'none' && !b.alertsPaused)
      );
    }
    if (searchQuery.trim()) {
      const q = norm(searchQuery);
      result = result.filter((b: InventoryItem) => {
        const cellar = cellars?.find((c: Cellar) => c.id === b.cellarId);
        const cellarName = cellar ? norm(cellar.name) : '';
        const searchStrings = [
          b.name, b.producer, b.vintage?.toString(),
          t(`categories.${b.category}`), b.region, cellarName,
          ...(b.collections ?? []).map(c => c.name),
          ...(b.tags || [])
        ].filter(Boolean) as string[];
        return searchStrings.some((s: string) => norm(s).includes(q));
      });
    }

    if (sortBy === 'value') {
      result = [...result].sort((a, b) => {
        const va = a.estimatedValue ?? a.purchasePrice ?? 0;
        const vb = b.estimatedValue ?? b.purchasePrice ?? 0;
        return vb - va;
      });
    } else if (sortBy === 'urgency') {
      const urgencyOrder: Record<string, number> = { past: 0, approaching: 1, peak: 2, none: 3 };
      result = [...result].sort((a, b) =>
        (urgencyOrder[a.alertStatus ?? 'none'] ?? 3) - (urgencyOrder[b.alertStatus ?? 'none'] ?? 3)
      );
    } else if (sortBy === 'name') {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [items, searchQuery, selectedCategories, selectedCellars, selectedCollectionId, selectedTags, minValue, maxValue, sortBy, cellars, openedFilter, t, hasMounted, lockedCategories]);

  type ColDef = { key: string; label: string; width?: number; className?: string };
  const tableColumns = useMemo<ColDef[]>(() => [
    ...(bulkMode ? [{ key: 'check', label: ' ', width: 40 }] : []),
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

  const toggleBulkMode = useCallback(() => {
    setBulkMode((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  const syncCollections = useCallback(
    async (itemId: string, newCollectionIds: string[], oldCollectionIds: string[]) => {
      const oldSet = new Set(oldCollectionIds);
      const newSet = new Set(newCollectionIds);
      const toAdd = newCollectionIds.filter(id => !oldSet.has(id));
      const toRemove = oldCollectionIds.filter(id => !newSet.has(id));
      await Promise.all([
        ...toAdd.map(colId => addItemsToCollectionMutation.mutateAsync({ id: colId, itemIds: [itemId] })),
        ...toRemove.map(colId => removeItemFromCollectionMutation.mutateAsync({ id: colId, itemId })),
      ]);
    },
    [addItemsToCollectionMutation, removeItemFromCollectionMutation]
  );

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
      setMode('idle');
      if (collectionIds.length > 0) await syncCollections(created.id, collectionIds, []);
    },
    [createMutation, items, syncCollections]
  );

  const handleDuplicateIncrement = useCallback(() => {
    if (!duplicateFound || !duplicateCandidate) return;
    const newQty = (duplicateFound.quantity ?? 1) + (duplicateCandidate.quantity ?? 1);
    updateMutation.mutate(
      { id: duplicateFound.id, patch: { quantity: newQty } },
      { onSettled: () => { setMode('idle'); setDuplicateFound(null); setDuplicateCandidate(null); setPendingCollectionIds([]); } }
    );
  }, [duplicateFound, duplicateCandidate, updateMutation]);

  const handleDuplicateCreateAnyway = useCallback(async () => {
    if (!duplicateCandidate) return;
    const collIds = pendingCollectionIds;
    setDuplicateFound(null);
    setDuplicateCandidate(null);
    setPendingCollectionIds([]);
    const created = await createMutation.mutateAsync(duplicateCandidate as InventoryItem);
    setMode('idle');
    if (collIds.length > 0) await syncCollections(created.id, collIds, []);
  }, [duplicateCandidate, pendingCollectionIds, createMutation, syncCollections]);

  const handleDuplicateCancel = useCallback(() => {
    setDuplicateFound(null);
    setDuplicateCandidate(null);
    setPendingCollectionIds([]);
  }, []);

  const handleBulkApply = useCallback(
    (patch: Partial<InventoryItem>) => {
      bulkUpdateMutation.mutate(
        { ids: Array.from(selectedIds), patch },
        {
          onSuccess: (res) => {
            setBulkSuccessCount(res.updatedCount);
            setBulkMode(false);
            setSelectedIds(new Set());
            setIsBulkDialogOpen(false);
          },
        }
      );
    },
    [selectedIds, bulkUpdateMutation]
  );

  const handleUpdate = useCallback(
    async (values: Partial<InventoryItem>, newCollectionIds: string[]) => {
      if (!editingItem) return;
      await updateMutation.mutateAsync({ id: editingItem.id, patch: values });
      const oldIds = (editingItem.collections ?? []).map(c => c.id);
      await syncCollections(editingItem.id, newCollectionIds, oldIds);
      setMode('idle');
      setEditingItem(null);
    },
    [editingItem, updateMutation, syncCollections]
  );

  const handleDelete = useCallback(
    (item: InventoryItem) => {
      deleteMutation.mutate(item.id, { onSuccess: () => setUndoTarget(item) });
    },
    [deleteMutation]
  );

  const handleUndo = useCallback(() => {
    if (!undoTarget) return;
    restoreMutation.mutate(undoTarget.id);
    setUndoTarget(null);
  }, [undoTarget, restoreMutation]);

  const handleEdit = useCallback((item: InventoryItem) => {
    setEditingItem(item);
    setMode('editing');
  }, []);

  const handleView = useCallback((item: InventoryItem) => setViewingItem(item), []);
  const handleCancel = useCallback(() => { setMode('idle'); setEditingItem(null); }, []);

  const hasCellars = (cellars?.length ?? 0) > 0;
  const categoryLabel = (cat: string) => t(`categories.${cat}`);
  const hasActiveFilters = selectedCategories.length > 0 || selectedCellars.length > 0 || openedFilter !== 'all' || !!searchQuery || !!selectedCollectionId || selectedTags.length > 0 || minValue !== '' || maxValue !== '' || sortBy !== 'default';
  const activeCollectionName = selectedCollectionId ? (allCollections?.find(c => c.id === selectedCollectionId)?.name ?? '') : '';

  return (
    <div className="p-4 sm:p-6">
      {/* Stats row */}
      {!isLoading && baseItems.length > 0 && mode === 'idle' && (
        <div className="flex gap-3 sm:gap-4 mb-5">
          {[
            { value: baseItems.length, label: t('inventory.stats.total'), color: '' },
            { value: baseItems.filter(b => !b.isOpened).length, label: t('inventory.stats.full'), color: 'text-success' },
            { value: baseItems.filter(b => b.isOpened).length, label: lockedCategories?.includes('cigar') ? t('inventory.stats.openedCigar') : t('inventory.stats.opened'), color: 'text-warning' },
          ].map(({ value, label, color }) => (
            <div key={label} className="flex-1 border border-divider rounded-xl p-3 sm:p-4 text-center">
              <p className={`text-2xl font-bold leading-tight ${color}`}>{value}</p>
              <p className="text-xs text-default-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-col md:flex-row gap-5 items-start">
        <InventoryFilterBar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          selectedCategories={selectedCategories}
          onSelectedCategoriesChange={setSelectedCategories}
          selectedCellars={selectedCellars}
          onSelectedCellarsChange={setSelectedCellars}
          selectedCollectionId={selectedCollectionId}
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
          minValue={minValue}
          onMinValueChange={setMinValue}
          maxValue={maxValue}
          onMaxValueChange={setMaxValue}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          openedFilter={openedFilter}
          onOpenedFilterChange={setOpenedFilter}
          isFiltersOpen={isFiltersOpen}
          onToggleFilters={toggleFilters}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          cellars={cellars}
          allTags={allTags}
          t={t}
          lockedCategories={lockedCategories}
        />

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2 items-center">
              {!isMobile && <ViewToggle value={viewMode} onChange={setViewMode} />}
            </div>
            <div className="flex gap-2 items-center">
              {items && items.length > 0 && (
                <Button
                  variant={bulkMode ? 'solid' : 'bordered'}
                  color={bulkMode ? 'secondary' : 'primary'}
                  startContent={bulkMode ? <X size={14} /> : <List size={14} />}
                  onPress={toggleBulkMode}
                  size="sm"
                >
                  {bulkMode ? t('actions.cancel') : t('actions.select')}
                </Button>
              )}
              <Button
                color="primary"
                startContent={<Plus size={14} />}
                onPress={() => setMode('creating')}
                size="sm"
                aria-label={t('inventory.add')}
                isDisabled={!hasCellars || bulkMode}
              >
                {t('inventory.add')}
              </Button>
            </div>
          </div>

          {/* Error */}
          {isError && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 rounded-xl px-4 py-3 mb-4 text-sm">
              {t('status.error')}
            </div>
          )}

          {/* Active collection banner */}
          {selectedCollectionId && activeCollectionName && (
            <div className="mb-4">
              <Chip
                size="sm"
                variant="bordered"
                color="primary"
                onClose={() => router.push(pathname)}
              >
                {t('collections.filterActive', { name: activeCollectionName })}
              </Chip>
            </div>
          )}

          {/* Form dialog */}
          <InventoryForm
            open={mode !== 'idle'}
            initialValues={mode === 'editing' && editingItem ? editingItem : undefined}
            onSubmit={mode === 'creating' ? handleCreate : handleUpdate}
            onClose={handleCancel}
            isSubmitting={createMutation.isPending || updateMutation.isPending || addItemsToCollectionMutation.isPending || removeItemFromCollectionMutation.isPending}
            t={t}
          />

          {/* Loading skeletons */}
          {isLoading && effectiveViewMode === 'grid' && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <InventoryCardSkeleton key={i} />
              ))}
            </div>
          )}
          {isLoading && effectiveViewMode === 'list' && (
            <div className="border border-divider rounded-xl overflow-hidden">
              <table className="w-full">
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => <InventoryListRowSkeleton key={i} />)}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty states */}
          {!isLoading && !isError && mode === 'idle' && (
            <>
              {items?.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-divider rounded-xl bg-default-50">
                  {hasCellars ? (
                    <>
                      <p className="text-lg font-semibold text-default-500 mb-1">{t('inventory.noBottles')}</p>
                      <p className="text-sm text-default-400 mb-4">{t('inventory.noBottlesDesc')}</p>
                      <Button color="primary" startContent={<Plus size={16} />} onPress={() => setMode('creating')}>
                        {t('inventory.add')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-semibold text-default-500 mb-1">{t('inventory.createCellarFirst')}</p>
                      <p className="text-sm text-default-400 mb-5">{t('inventory.createCellarFirstDesc')}</p>
                      <Button color="primary" startContent={<Warehouse size={16} />} as={Link} href="/cellars">
                        {t('nav.caves')}
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                searchQuery.trim() && filteredItems.length === 0 && (
                  <div className="text-center py-16">
                    <Search size={56} className="text-default-200 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-default-500">
                      {t('inventory.noResults', { query: searchQuery })}
                    </p>
                  </div>
                )
              )}
            </>
          )}

          {/* Grid view */}
          {!isLoading && filteredItems.length > 0 && effectiveViewMode === 'grid' && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filteredItems.map((item: InventoryItem) => (
                <InventoryCard
                  key={item.id}
                  item={item}
                  categoryLabel={categoryLabel(item.category)}
                  cellarName={cellars?.find((c: Cellar) => c.id === item.cellarId)?.name}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onView={bulkMode ? undefined : handleView}
                  t={t}
                  isSelected={selectedIds.has(item.id)}
                  onSelectToggle={bulkMode ? handleSelectToggle : undefined}
                />
              ))}
            </div>
          )}

          {/* List view */}
          {!isLoading && filteredItems.length > 0 && effectiveViewMode === 'list' && (
            <Table
              isCompact
              isStriped={false}
              shadow="none"
              radius="none"
              classNames={{ wrapper: 'border border-divider rounded-xl' }}
            >
              <TableHeader columns={tableColumns}>
                {(col) => (
                  <TableColumn key={col.key} width={col.width} className={col.className}>
                    {col.label}
                  </TableColumn>
                )}
              </TableHeader>
              <TableBody items={filteredItems}>
                {(item: InventoryItem) => React.cloneElement(
                  InventoryListRow({
                    item,
                    categoryLabel: categoryLabel(item.category),
                    cellar: cellars?.find((c: Cellar) => c.id === item.cellarId) ?? undefined,
                    onEdit: handleEdit,
                    onDelete: handleDelete,
                    onView: bulkMode ? undefined : handleView,
                    t,
                    isSelected: selectedIds.has(item.id),
                    onSelectToggle: bulkMode ? handleSelectToggle : undefined,
                  }),
                  { key: item.id }
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* FAB (mobile only) */}
      <Button
        color="primary"
        radius="full"
        size="lg"
        isIconOnly
        className="fixed bottom-[84px] md:bottom-6 right-4 z-30 sm:hidden shadow-lg"
        onPress={() => setMode('creating')}
        isDisabled={!hasCellars}
        aria-label={t('inventory.add')}
      >
        <Plus size={22} />
      </Button>

      {/* Toasts */}
      {undoTarget && (
        <UndoToast
          message={t('toast.deleteSuccess')}
          undoLabel={t('actions.undo')}
          onUndo={handleUndo}
          onExpire={() => setUndoTarget(null)}
        />
      )}
      {bulkSuccessCount !== null && (
        <UndoToast
          message={t('bulk.success', { count: bulkSuccessCount })}
          undoLabel={t('actions.close')}
          onUndo={() => setBulkSuccessCount(null)}
          onExpire={() => setBulkSuccessCount(null)}
        />
      )}

      {/* Bulk floating bar */}
      {bulkMode && selectedIds.size > 0 && (
        <InventoryBulkBar
          selectedCount={selectedIds.size}
          onBulkAction={() => setIsBulkDialogOpen(true)}
          t={t}
        />
      )}

      <BulkActionDialog
        open={isBulkDialogOpen}
        onClose={() => setIsBulkDialogOpen(false)}
        selectedItems={items?.filter(b => selectedIds.has(b.id)) || []}
        onApply={handleBulkApply}
        isSubmitting={bulkUpdateMutation.isPending}
        t={t}
      />

      <InventoryDetailDialog
        item={viewingItem}
        open={Boolean(viewingItem)}
        onClose={() => setViewingItem(null)}
        onEdit={handleEdit}
        t={t}
      />

      {duplicateFound && duplicateCandidate && (
        <DuplicateDialog
          duplicate={duplicateFound}
          candidate={duplicateCandidate}
          cellars={cellars ?? []}
          t={t}
          onIncrement={handleDuplicateIncrement}
          onCreateAnyway={handleDuplicateCreateAnyway}
          onCancel={handleDuplicateCancel}
        />
      )}
    </div>
  );
}
