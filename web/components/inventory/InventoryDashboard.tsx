'use client';
import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Button, Chip } from '@heroui/react';
import { Plus, Search, Warehouse, Wine, Leaf, ClipboardCheck, Camera } from 'lucide-react';
import Link from 'next/link';
import { InventoryItem } from '@/lib/inventory/types';
import { isFinishedItem, isOwnedItem } from '@/lib/inventory/ownership';
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
import type { InventoryCategory } from '@/lib/inventory/types';
import { UndoToast } from '@/components/ui/UndoToast';
import { notifySuccess } from '@/lib/toast';
import { InventoryFilterBar, InventoryFilterToggleButton } from './InventoryFilterBar';
import { InventoryBulkBar, InventoryBulkToggleButton } from './InventoryBulkBar';
import { InventoryListRowSkeleton } from './InventoryListRow';
import { InventoryGridView } from './InventoryGridView';
import { InventoryListView } from './InventoryListView';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useViewMode } from '@/hooks/useViewMode';
import { usePageSize } from '@/hooks/usePageSize';
import { PageSizeToggle } from '@/components/ui/PageSizeToggle';

// Screens that only appear after an action are split out of the page's first
// load; they open behind a click, so a null placeholder is invisible.
const InventoryForm = dynamic(() => import('./InventoryForm').then((m) => m.InventoryForm), { ssr: false, loading: () => null });
const InventoryDetailDialog = dynamic(() => import('./InventoryDetailDialog').then((m) => m.InventoryDetailDialog), { ssr: false, loading: () => null });
const DuplicateDialog = dynamic(() => import('./DuplicateDialog').then((m) => m.DuplicateDialog), { ssr: false, loading: () => null });
const ScanFlow = dynamic(() => import('./ScanFlow').then((m) => m.ScanFlow), { ssr: false, loading: () => null });

type UIMode = 'idle' | 'creating' | 'editing';

interface InventoryDashboardProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  lockedCategories?: string[];
}

// Detect mobile via useSyncExternalStore (React's own replacement for the
// useState+useEffect+matchMedia-listener pattern) rather than local state:
// avoids a setState-in-effect and gets the SSR default (desktop) for free.
function subscribeToMobileQuery(callback: () => void) {
  const mq = window.matchMedia('(max-width: 767px)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}
function getIsMobileSnapshot() {
  return window.matchMedia('(max-width: 767px)').matches;
}
function getIsMobileServerSnapshot() {
  return false;
}

export function InventoryDashboard({ t, lockedCategories }: InventoryDashboardProps) {
  const { data: items, isLoading, isError, refetch, isRefetching } = useInventory();
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
  // Only rendered once `cellars` has loaded client-side, so reading storage lazily is hydration-safe.
  const [noCellarBannerDismissed, setNoCellarBannerDismissed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('glou.noCellarBannerDismissed') === '1'; } catch { return false; }
  });
  const dismissNoCellarBanner = useCallback(() => {
    setNoCellarBannerDismissed(true);
    try { localStorage.setItem('glou.noCellarBannerDismissed', '1'); } catch { /* storage unavailable */ }
  }, []);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);
  const [undoTarget, setUndoTarget] = useState<InventoryItem | null>(null);

  const bulkUpdateMutation = useBulkUpdateInventoryItem();
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const {
    searchQuery,
    selectedCategories, setSelectedCategories,
    selectedCellars, setSelectedCellars,
    selectedCollectionId,
    selectedTags, setSelectedTags,
    selectedWineColors, setSelectedWineColors,
    minValue, setMinValue,
    maxValue, setMaxValue,
    sortBy, setSortBy,
    openedFilter, setOpenedFilter,
    showReferences, setShowReferences,
    isFiltersOpen, toggleFilters,
    tagSearchQuery, setTagSearchQuery,
    showAllTags, setShowAllTags,
    clearFilters,
    baseItems,
    filteredItems,
    hasActiveFilters,
  } = useInventoryFilters({ items, cellars, lockedCategories, t, hasMounted });

  // #504: the counters answer "how many do I hold here?": the chosen section
  // only, never non-owned references, and finished bottles counted apart.
  const stats = useMemo(() => {
    const owned = baseItems.filter(isOwnedItem);
    const inSection = selectedCategories.length > 0
      ? owned.filter((b) => selectedCategories.includes(b.category))
      : owned;
    const held = inSection.filter((b) => !isFinishedItem(b));
    return { held, finished: inSection.length - held.length };
  }, [baseItems, selectedCategories]);

  // Auto-open bottle from QR scan (FEAT-10). Kept out of useInventoryFilters
  // because it needs `setViewingItem`, dashboard-local UI state unrelated to
  // filtering — see the hook's file header for the full rationale.
  useEffect(() => {
    const scanParam = searchParams.get('scan');
    if (scanParam && items) {
      const found = items.find((i) => i.id === scanParam);
      if (found) {
        // Paired with the router.replace() below (an external navigation
        // side effect that must stay in an effect) — splitting this
        // setState out to render-time would desync it from the URL cleanup.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViewingItem(found);
        // Remove ?scan= from URL to avoid reopening on refresh
        const next = new URLSearchParams(searchParams.toString());
        next.delete('scan');
        router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
      }
    }
  }, [searchParams, items, pathname, router]);

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

  const isMobile = useSyncExternalStore(subscribeToMobileQuery, getIsMobileSnapshot, getIsMobileServerSnapshot);

  const effectiveViewMode = isMobile ? 'grid' : viewMode;

  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedItems = useMemo(
    () => filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredItems, currentPage, pageSize]
  );

  // Reset anchor and page when filters or sort change, and reset page when
  // page size changes — both adjusted during render (React's documented
  // pattern) rather than in effects, guarded against the previous render's
  // values so each reset only fires on an actual change.
  const filterSortKey = [
    searchQuery, selectedCategories, selectedCellars, selectedTags,
    selectedWineColors, minValue, maxValue, sortBy, openedFilter, showReferences, selectedCollectionId,
  ];
  const [prevFilterSortKey, setPrevFilterSortKey] = useState(filterSortKey);
  if (filterSortKey.some((v, i) => v !== prevFilterSortKey[i])) {
    setPrevFilterSortKey(filterSortKey);
    setAnchorId(null);
    setCurrentPage(1);
  }

  const [prevPageSize, setPrevPageSize] = useState(pageSize);
  if (pageSize !== prevPageSize) {
    setPrevPageSize(pageSize);
    setCurrentPage(1);
  }

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
            // Plain success toast, not an UndoToast: a bulk update has no
            // undo window, so no countdown bar should suggest one (ISSUE_124).
            notifySuccess('bulk.success', { count: res.updatedCount });
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
      try {
        await updateMutation.mutateAsync({ id: editingItem.id, patch: values });
        const oldIds = (editingItem.collections ?? []).map(c => c.id);
        await syncCollections(editingItem.id, newCollectionIds, oldIds);
      } catch {
        // Reported by the mutation's onError toast; keep the form open.
        return;
      }
      notifySuccess('toast.updateSuccess');
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

  // `cellars` is undefined while loading: only warn once we know there are none.
  const noCellars = cellars !== undefined && cellars.length === 0;
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
    showReferences,
    setShowReferences,
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
        <div className="mb-5">
          <div className="flex gap-3 sm:gap-4">
            {[
              { value: stats.held.length, label: t('inventory.stats.total'), color: '' },
              { value: stats.held.filter(b => !b.isOpened).length, label: t('inventory.stats.full'), color: 'text-success-700' },
              { value: stats.held.filter(b => b.isOpened).length, label: lockedCategories?.includes('cigar') ? t('inventory.stats.openedCigar') : t('inventory.stats.opened'), color: 'text-warning-700' },
            ].map(({ value, label, color }) => (
              <div key={label} className="flex-1 border border-divider rounded-xl p-3 sm:p-4 text-center">
                <p className={`text-2xl font-bold leading-tight ${color}`}>{value}</p>
                <p className="text-xs text-foreground-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
          {stats.finished > 0 && (
            <p className="text-xs text-foreground-500 mt-2">{t('inventory.stats.finished', { count: stats.finished })}</p>
          )}
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
                t={t}
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
                isDisabled={bulkMode}
              >
                {t('scan.launchButton')}
              </Button>
              <Button
                data-testid="inventory-add-button"
                color="primary"
                startContent={<Plus size={14} />}
                onPress={() => setMode('creating')}
                size="sm"
                aria-label={t('inventory.add')}
                isDisabled={bulkMode}
              >
                {t('inventory.add')}
              </Button>
            </div>
          </div>

          {noCellars && !noCellarBannerDismissed && (
            <div
              role="status"
              data-testid="no-cellar-banner"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-divider bg-default-100 px-3 py-2 mb-3 text-sm"
            >
              <Warehouse size={16} className="text-foreground-500 shrink-0" />
              <span className="flex-1 min-w-0">{t('inventory.noCellarBanner')}</span>
              <Button as={Link} href="/cellars" size="sm" variant="flat" color="primary">
                {t('inventory.noCellarBannerAction')}
              </Button>
              <Button size="sm" variant="light" onPress={dismissNoCellarBanner}>
                {t('actions.dismiss')}
              </Button>
            </div>
          )}

          {/* Mobile: collapsible filter */}
          <InventoryFilterBar variant="mobile" {...filterBarProps} />

          {/* Error */}
          {isError && (
            <ErrorState
              className="mb-4"
              message={t('inventory.errors.load')}
              onRetry={() => { void refetch(); }}
              isRetrying={isRefetching}
            />
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
            defaultCategory={
              lockedCategories?.length === 1
                ? (lockedCategories[0] as InventoryCategory)
                : selectedCategories.length === 1
                ? (selectedCategories[0] as InventoryCategory)
                : undefined
            }
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
              {/* `baseItems` (not `items`) so a category-scoped page — /cigars
                  with a wine-only inventory — gets the empty state instead of
                  a blank zone. */}
              {items && baseItems.length === 0 ? (
                <EmptyState
                  bordered
                  title={t('inventory.noBottles')}
                  description={t('inventory.noBottlesDesc')}
                  action={
                    <Button color="primary" startContent={<Plus size={16} />} onPress={() => setMode('creating')}>
                      {t('inventory.add')}
                    </Button>
                  }
                />
              ) : (
                // Any active filter (category, cellar, tag, price range, opened
                // status...) can empty the list, not just the search box — all
                // of them must get the "no result" state and a way out.
                hasActiveFilters && filteredItems.length === 0 && (
                  <EmptyState
                    icon={<Search size={56} className="text-default-200" />}
                    title={
                      searchQuery.trim()
                        ? t('inventory.noResults', { query: searchQuery })
                        : t('inventory.noResultsFilters')
                    }
                    description={t('inventory.noResultsFiltersDesc')}
                    action={
                      <Button variant="light" color="primary" onPress={clearFilters}>
                        {t('inventory.resetFilters')}
                      </Button>
                    }
                  />
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
