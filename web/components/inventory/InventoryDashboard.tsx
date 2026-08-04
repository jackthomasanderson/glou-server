'use client';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Button, Chip } from '@heroui/react';
import { Plus, Search, Warehouse, Wine, Leaf, ClipboardCheck, Camera } from 'lucide-react';
import Link from 'next/link';
import { InventoryItem } from '@/lib/inventory/types';
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
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useInventoryFilters } from '@/hooks/useInventoryFilters';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { useDuplicateResolution } from '@/hooks/useDuplicateResolution';
import { InventoryCardSkeleton } from './InventoryCard';
import { InventoryForm } from './InventoryForm';
import { UndoToast } from '@/components/ui/UndoToast';
import { InventoryFilterBar, InventoryFilterToggleButton } from './InventoryFilterBar';
import { InventoryBulkBar, InventoryBulkToggleButton } from './InventoryBulkBar';
import { InventoryDetailDialog } from './InventoryDetailDialog';
import { InventoryListRowSkeleton } from './InventoryListRow';
import { InventoryGridView } from './InventoryGridView';
import { InventoryListView } from './InventoryListView';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { usePageSize } from '@/hooks/usePageSize';
import { PageSizeToggle } from '@/components/ui/PageSizeToggle';
import { DuplicateDialog } from './DuplicateDialog';
import { ScanFlow } from './ScanFlow';

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

  // FEAT-16/23: items with an offline mutation still sitting in the local
  // sync queue get a small "pending" indicator on their card/row.
  const { queue: offlineSyncQueue } = useOfflineSync();
  const pendingSyncItemIds = useMemo(
    () => new Set(offlineSyncQueue.map((m) => m.itemId)),
    [offlineSyncQueue]
  );

  const [mode, setMode] = useState<UIMode>('idle');
  const [scanOpen, setScanOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);
  const [undoTarget, setUndoTarget] = useState<InventoryItem | null>(null);

  const bulkUpdateMutation = useBulkUpdateInventoryItem();
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkSuccessCount, setBulkSuccessCount] = useState<number | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const {
    searchQuery, setSearchQuery,
    selectedCategories, setSelectedCategories,
    selectedCellars, setSelectedCellars,
    selectedCollectionId,
    selectedTags, setSelectedTags,
    selectedWineColors, setSelectedWineColors,
    minValue, setMinValue,
    maxValue, setMaxValue,
    sortBy, setSortBy,
    openedFilter, setOpenedFilter,
    isFiltersOpen, toggleFilters,
    tagSearchQuery, setTagSearchQuery,
    showAllTags, setShowAllTags,
    clearFilters,
    baseItems,
    filteredItems,
    hasActiveFilters,
  } = useInventoryFilters({ items, cellars, lockedCategories, t, hasMounted });

  // Auto-open bottle from QR scan (FEAT-10). Kept out of useInventoryFilters
  // because it needs `setViewingItem`, dashboard-local UI state unrelated to
  // filtering — see the hook's file header for the full rationale.
  useEffect(() => {
    const scanParam = searchParams.get('scan');
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

  const {
    bulkMode, setBulkMode,
    selectedIds,
    anchorId, setAnchorId,
    toggleBulkMode,
    handleSelectToggle,
    clearSelection,
  } = useBulkSelection(filteredItems);

  const [viewMode, setViewMode] = useViewMode('inventory');

  // Detect mobile via CSS (no MUI hook needed)
  const tabKey = lockedCategories?.includes('cigar') ? 'cigars' : 'bottles';
  const [pageSize, setPageSize] = usePageSize(tabKey);
  const [currentPage, setCurrentPage] = useState(1);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveViewMode = isMobile ? 'grid' : viewMode;

  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedItems = useMemo(
    () => filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredItems, currentPage, pageSize]
  );

  // Reset anchor and page when filters or sort change
  useEffect(() => {
    setAnchorId(null);
    setCurrentPage(1);
  }, [searchQuery, selectedCategories, selectedCellars, selectedTags, selectedWineColors, minValue, maxValue, sortBy, openedFilter, selectedCollectionId]);

  // Reset page when page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

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

  const {
    duplicateFound,
    duplicateCandidate,
    handleCreate,
    handleDuplicateIncrement,
    handleDuplicateCreateAnyway,
    handleDuplicateCancel,
  } = useDuplicateResolution({
    items,
    createMutation,
    updateMutation,
    syncCollections,
    onResolved: () => setMode('idle'),
  });

  const handleBulkApply = useCallback(
    (patch: Partial<InventoryItem>) => {
      bulkUpdateMutation.mutate(
        { ids: Array.from(selectedIds), patch },
        {
          onSuccess: (res) => {
            setBulkSuccessCount(res.updatedCount);
            setBulkMode(false);
            clearSelection();
            setIsBulkDialogOpen(false);
          },
        }
      );
    },
    [selectedIds, bulkUpdateMutation, setBulkMode, clearSelection]
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
  const activeCollectionName = selectedCollectionId ? (allCollections?.find(c => c.id === selectedCollectionId)?.name ?? '') : '';

  // Shared prop bag for the desktop sidebar + mobile collapsible renderings
  // of the filter panel — both are the same InventoryFilterBar with a
  // different `variant`, kept in sync by passing the exact same filter
  // state/setters to each (unchanged from before this pass, just no longer
  // duplicated prop-by-prop at each call site).
  const filterBarProps = {
    t,
    lockedCategories,
    cellars,
    items,
    isFiltersOpen,
    hasActiveFilters,
    onClearFilters: clearFilters,
    selectedCategories,
    setSelectedCategories,
    selectedCellars,
    setSelectedCellars,
    selectedWineColors,
    setSelectedWineColors,
    selectedTags,
    setSelectedTags,
    minValue,
    setMinValue,
    maxValue,
    setMaxValue,
    sortBy,
    setSortBy,
    openedFilter,
    setOpenedFilter,
    tagSearchQuery,
    setTagSearchQuery,
    showAllTags,
    setShowAllTags,
  };

  // Shared prop bag for the grid/list item-view components: both take the
  // exact same shape (see InventoryGridView / InventoryListView), only the
  // rendering (cards vs table) differs.
  const itemsViewProps = {
    items: paginatedItems,
    cellars,
    categoryLabel,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onView: handleView,
    t,
    bulkMode,
    selectedIds,
    anchorId,
    onSelectToggle: handleSelectToggle,
    pendingSyncItemIds,
    page: currentPage,
    totalPages,
    totalItems: filteredItems.length,
    setCurrentPage,
  };

  return (
    <div className="p-4 pb-24 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2">
          {lockedCategories?.includes('cigar') ? (
            <Leaf size={22} className="text-primary" />
          ) : (
            <Wine size={22} className="text-primary" />
          )}
          <h1 className="text-xl font-bold">
            {lockedCategories?.includes('cigar') ? t('nav.cigars') : t('nav.bottles')}
          </h1>
        </div>
        <Button
          as={Link}
          href="/inventory-count"
          variant="bordered"
          color="primary"
          size="sm"
          startContent={<ClipboardCheck size={14} />}
          className="hidden sm:flex"
        >
          {t('inventoryCount.accessButton')}
        </Button>
      </div>

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
      <div className="flex gap-5 items-start">
        {/* Desktop filter panel */}
        <InventoryFilterBar variant="desktop" {...filterBarProps} />

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div className="flex flex-wrap gap-2 items-center">
              <InventoryFilterToggleButton
                isFiltersOpen={isFiltersOpen}
                hasActiveFilters={hasActiveFilters}
                onToggle={toggleFilters}
              />
              {!isMobile && <ViewToggle value={viewMode} onChange={setViewMode} />}
              {!isMobile && <div className="w-px h-5 bg-divider" />}
              <PageSizeToggle value={pageSize} onChange={setPageSize} />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {items && items.length > 0 && (
                <InventoryBulkToggleButton bulkMode={bulkMode} onToggle={toggleBulkMode} t={t} />
              )}
              <Button
                color="secondary"
                variant="flat"
                startContent={<Camera size={14} />}
                onPress={() => setScanOpen(true)}
                size="sm"
                aria-label={t('scan.launchButton')}
                isDisabled={!hasCellars || bulkMode}
              >
                {t('scan.launchButton')}
              </Button>
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

          {/* Mobile: collapsible filter */}
          <InventoryFilterBar variant="mobile" {...filterBarProps} />

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
            onScanRequested={mode === 'creating' ? () => { setMode('idle'); setScanOpen(true); } : undefined}
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
            <InventoryGridView {...itemsViewProps} />
          )}

          {/* List view */}
          {!isLoading && filteredItems.length > 0 && effectiveViewMode === 'list' && (
            <InventoryListView {...itemsViewProps} />
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
      <InventoryBulkBar
        t={t}
        bulkMode={bulkMode}
        selectedIds={selectedIds}
        items={items}
        isBulkDialogOpen={isBulkDialogOpen}
        onOpenDialog={() => setIsBulkDialogOpen(true)}
        onCloseDialog={() => setIsBulkDialogOpen(false)}
        onApply={handleBulkApply}
        isSubmitting={bulkUpdateMutation.isPending}
        bulkSuccessCount={bulkSuccessCount}
        onCloseSuccessToast={() => setBulkSuccessCount(null)}
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

      <ScanFlow open={scanOpen} onClose={() => setScanOpen(false)} t={t} />
    </div>
  );
}
