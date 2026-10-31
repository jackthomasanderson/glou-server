'use client';
import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Button, Chip } from '@heroui/react';
import { Plus, Search, Wine, Leaf, ClipboardCheck, Camera } from 'lucide-react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { InventoryItem } from '@/lib/inventory/types';
import { newestCopy } from '@/lib/inventory/newestCopy';
import type { Product } from '@/lib/products/types';
import { describeStock } from '@/lib/products/stock';
import { formatDate } from '@/lib/format';
import {
  INVENTORY_KEY,
  useInventory,
  useInventoryTruncated,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useBulkUpdateInventoryItem,
} from '@/hooks/useInventory';
import { useProducts, useProductsTruncated, useTrashProduct, useRestoreProduct } from '@/hooks/useProducts';
import { useCellars } from '@/hooks/useCellars';
import { useCollections, useAddItemsToCollection, useRemoveItemFromCollection } from '@/hooks/useCollections';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useInventoryFilters } from '@/hooks/useInventoryFilters';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { useDuplicateResolution } from '@/hooks/useDuplicateResolution';
import { useScanAvailability } from '@/hooks/useScan';
import { InventoryCardSkeleton } from './InventoryCard';
import type { InventoryCategory } from '@/lib/inventory/types';
import { UndoToast } from '@/components/ui/UndoToast';
import { notifySuccess } from '@/lib/toast';
import { applyCollectionChanges } from '@/lib/collections/sync';
import { InventoryFilterBar, InventoryFilterToggleButton } from './InventoryFilterBar';
import { InventoryBulkBar, InventoryBulkToggleButton } from './InventoryBulkBar';
import { InventoryListRowSkeleton } from './InventoryListRow';
import { InventoryGridView } from './InventoryGridView';
import { InventoryListView } from './InventoryListView';
import { InventoryStatsLine } from './InventoryStatsLine';
import { InventoryBanners } from './InventoryBanners';
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
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  // #471: the list shows wines (families); the flat bottles still back the
  // drawer, the edit form, QR codes, duplicates and bulk actions until their lots.
  const { data: products, isLoading, isError, refetch, isRefetching } = useProducts();
  const { data: items } = useInventory();
  const productsTruncated = useProductsTruncated();
  const itemsTruncated = useInventoryTruncated();
  const isTruncated = productsTruncated || itemsTruncated;
  const { data: cellars } = useCellars();
  const { data: allCollections } = useCollections();
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const trashMutation = useTrashProduct();
  const restoreMutation = useRestoreProduct();
  const addItemsToCollectionMutation = useAddItemsToCollection();
  const removeItemFromCollectionMutation = useRemoveItemFromCollection();
  const hasMounted = useHasMounted();

  // FEAT-16/23: wines with a bottle change still sitting in the local sync
  // queue get a small "pending" indicator on their card/row.
  const { queue: offlineSyncQueue } = useOfflineSync();
  const pendingSyncIds = useMemo(() => {
    const queuedItemIds = new Set(offlineSyncQueue.map((m) => m.itemId));
    const ids = new Set<string>();
    for (const item of items ?? []) if (queuedItemIds.has(item.id) && item.productId) ids.add(item.productId);
    for (const product of products ?? []) {
      if (product.items.some((unit) => queuedItemIds.has(unit.id))) ids.add(product.id);
    }
    return ids;
  }, [offlineSyncQueue, items, products]);

  // The bottle the (former) drawer and edit form open for a wine: one in
  // stock, else its most recently changed one (finished). None for a wine
  // known without any bottle record — its card then only offers the trash.
  const openableItemOf = useMemo(() => {
    const byId = new Map((items ?? []).map((item) => [item.id, item]));
    const latestByProduct = new Map<string, InventoryItem>();
    for (const item of items ?? []) {
      if (!item.productId) continue;
      const known = latestByProduct.get(item.productId);
      if (!known || item.updatedAt > known.updatedAt) latestByProduct.set(item.productId, item);
    }
    return (product: Product): InventoryItem | undefined =>
      product.items.map((unit) => byId.get(unit.id)).find(Boolean) ?? latestByProduct.get(product.id);
  }, [items]);
  const isOpenable = useCallback((product: Product) => openableItemOf(product) !== undefined, [openableItemOf]);

  const [mode, setMode] = useState<UIMode>('idle');
  const [scanOpen, setScanOpen] = useState(false);
  const scanAvailable = useScanAvailability();
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  // #572: the version the open edit form's save must still find on the
  // server, so a change made meanwhile by someone else is not overwritten.
  // Moves on with each save that went through: one whose collections then
  // failed keeps the form open, and its retry must not conflict with itself.
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);
  const [undoTarget, setUndoTarget] = useState<Product | null>(null);

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
    showGone, setShowGone,
    isFiltersOpen, toggleFilters,
    tagSearchQuery, setTagSearchQuery,
    showAllTags, setShowAllTags,
    clearFilters,
    baseItems,
    filteredItems,
    hasActiveFilters,
  } = useInventoryFilters({ products, cellars, lockedCategories, t, hasMounted });

  // #504: the counters answer "how many do I hold here?": the chosen section only.
  const statsProducts = useMemo(
    () => (selectedCategories.length > 0 ? baseItems.filter((p) => selectedCategories.includes(p.category)) : baseItems),
    [baseItems, selectedCategories],
  );

  // Auto-open from a QR scan (FEAT-10, a bottle's id) or the search (a
  // wine's id). Kept out of useInventoryFilters because it needs
  // `setViewingItem`, dashboard-local UI state unrelated to filtering.
  useEffect(() => {
    const scanParam = searchParams.get('scan');
    if (!scanParam || !items || !products) return;
    const product = products.find((p) => p.id === scanParam);
    const found = items.find((i) => i.id === scanParam) ?? (product ? openableItemOf(product) : undefined);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('scan');
    if (found) {
      // Paired with the router.replace() below (an external navigation
      // side effect that must stay in an effect) — splitting this
      // setState out to render-time would desync it from the URL cleanup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewingItem(found);
    } else if (product) {
      // A wine known without any bottle record: show its card instead.
      next.set('q', product.name);
    } else {
      return;
    }
    // Remove ?scan= from URL to avoid reopening on refresh
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
  }, [searchParams, items, products, openableItemOf, pathname, router]);

  const {
    bulkMode, setBulkMode,
    selectedIds, setSelectedIds,
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
    selectedWineColors, minValue, maxValue, sortBy, openedFilter, showGone, selectedCollectionId,
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
      await applyCollectionChanges([
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

  // Until the bulk actions on wines (lot P), the selected wines stand for
  // their bottles in stock.
  const selectedItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const product of products ?? []) {
      if (selectedIds.has(product.id)) for (const unit of product.items) ids.add(unit.id);
    }
    return ids;
  }, [products, selectedIds]);

  const handleBulkApply = useCallback(
    (patch: Partial<InventoryItem>) => {
      bulkUpdateMutation.mutate(
        { ids: Array.from(selectedItemIds), patch },
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
    [selectedItemIds, bulkUpdateMutation, setBulkMode, clearSelection]
  );

  const handleUpdate = useCallback(
    async (values: Partial<InventoryItem>, newCollectionIds: string[]) => {
      if (!editingItem) return;
      try {
        // Only the collections changed: no PATCH, which would bump the version for nothing.
        if (Object.keys(values).length > 0) {
          const saved = await updateMutation.mutateAsync({
            id: editingItem.id,
            patch: values,
            expectedUpdatedAt: editingVersion ?? editingItem.updatedAt,
          });
          setEditingVersion(saved.updatedAt);
        }
        const oldIds = (editingItem.collections ?? []).map(c => c.id);
        await syncCollections(editingItem.id, newCollectionIds, oldIds);
      } catch {
        // Reported by the update's onError toast or by applyCollectionChanges; keep the form open.
        return;
      }
      notifySuccess('toast.updateSuccess');
      setMode('idle');
      setEditingItem(null);
    },
    [editingItem, editingVersion, updateMutation, syncCollections]
  );

  // "Mettre ce vin à la corbeille": the wine and all its bottles (D10).
  const handleDelete = useCallback(
    (product: Product) => {
      trashMutation.mutate(product.id, { onSuccess: () => setUndoTarget(product) });
    },
    [trashMutation]
  );

  const handleUndo = useCallback(() => {
    if (!undoTarget) return;
    restoreMutation.mutate(undoTarget.id);
    setUndoTarget(null);
  }, [undoTarget, restoreMutation]);

  // The copy handed over may predate a change made since (e.g. the fill level
  // set in the detail window): the form must open with the latest one.
  const handleEditItem = useCallback((item: InventoryItem) => {
    const latest = newestCopy(
      item,
      queryClient.getQueryData<InventoryItem>(['inventory', item.id]),
      queryClient.getQueryData<InventoryItem[]>(INVENTORY_KEY)?.find((i) => i.id === item.id),
    );
    setEditingItem(latest);
    setEditingVersion(latest.updatedAt);
    setMode('editing');
  }, [queryClient]);

  const handleEdit = useCallback((product: Product) => {
    const item = openableItemOf(product);
    if (item) handleEditItem(item);
  }, [openableItemOf, handleEditItem]);

  const handleView = useCallback((product: Product) => setViewingItem(openableItemOf(product) ?? null), [openableItemOf]);
  const handleCancel = useCallback(() => { setMode('idle'); setEditingItem(null); }, []);

  const cellarNames = useMemo(() => new Map((cellars ?? []).map((c) => [c.id, c.name])), [cellars]);
  const cellarNameOf = useCallback((product: Product) => {
    const ids = new Set(product.items.map((unit) => unit.cellarId));
    const [only] = ids;
    return ids.size === 1 && only ? cellarNames.get(only) : undefined;
  }, [cellarNames]);
  const stockOf = useCallback(
    (product: Product) => describeStock(product, t, {
      cellarIds: selectedCellars,
      formatDate: (iso) => formatDate(iso, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
    }),
    [t, selectedCellars, i18n.language],
  );
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
    products,
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
    showGone,
    setShowGone,
    setOpenedFilter,
    tagSearchQuery,
    setTagSearchQuery,
    showAllTags,
    setShowAllTags,
  };

  // Shared prop bag for the grid/list item-view components (see
  // InventoryGridView / InventoryListView), only the rendering (cards vs
  // table) differs. The list's table reports its selection as a whole, so it
  // also gets the setter of the same selection (and ignores the card toggle).
  const itemsViewProps = {
    items: paginatedItems,
    stockOf,
    cellarNameOf,
    isOpenable,
    categoryLabel,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onView: handleView,
    t,
    bulkMode,
    selectedIds,
    anchorId,
    onSelectToggle: handleSelectToggle,
    pendingSyncIds,
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

      <InventoryBanners t={t} isTruncated={isTruncated} cellars={cellars} />

      {!isLoading && baseItems.length > 0 && mode === 'idle' && (
        <InventoryStatsLine products={statsProducts} isCigarPage={Boolean(lockedCategories?.includes('cigar'))} t={t} />
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
              {products && products.length > 0 && (
                <InventoryBulkToggleButton bulkMode={bulkMode} onToggle={toggleBulkMode} t={t} />
              )}
              {scanAvailable && (
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
              )}
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
            onScanRequested={mode === 'creating' && scanAvailable ? () => { setMode('idle'); setScanOpen(true); } : undefined}
          />

          {/* Loading skeletons */}
          {isLoading && effectiveViewMode === 'grid' && (
            <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 sm:gap-4">
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
              {products && baseItems.length === 0 && !hasActiveFilters ? (
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
            <InventoryListView {...itemsViewProps} onSelectedIdsChange={setSelectedIds} />
          )}
        </div>
      </div>

      {/* FAB (mobile only) */}
      <Button
        color="primary"
        radius="full"
        size="lg"
        isIconOnly
        className="fixed bottom-[calc(var(--bottom-nav-h)_+_1rem)] md:bottom-6 right-4 z-30 sm:hidden shadow-lg"
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
        selectedIds={selectedItemIds}
        selectedCount={selectedIds.size}
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
        onEdit={handleEditItem}
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
