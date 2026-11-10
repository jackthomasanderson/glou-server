'use client';
import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Button, Chip } from '@heroui/react';
import { Plus, Search, Camera, BookMarked } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_TITLES } from '@/lib/inventory/category-titles';
import { InventoryItem } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import { describeStock, wineName } from '@/lib/products/stock';
import { isGone, NO_CELLAR } from '@/lib/products/filters';
import { familyIdOf } from '@/lib/products/fromFlat';
import { inventoryClient } from '@/lib/inventory/client';
import { isFinishedState } from '@shared/units';
import { formatDate } from '@/lib/format';
import {
  useInventory,
  useInventoryTruncated,
  useBulkUpdateInventoryItem,
} from '@/hooks/useInventory';
import { useProducts, useProductsTruncated, useTrashProduct, useRestoreProduct } from '@/hooks/useProducts';
import { useCellars } from '@/hooks/useCellars';
import { useCollections } from '@/hooks/useCollections';
import { useCreateFromForm } from '@/hooks/useCreateFromForm';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useInventoryFilters } from '@/hooks/useInventoryFilters';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { useScanAvailability } from '@/hooks/useScan';
import { InventoryCardSkeleton } from './InventoryCard';
import type { InventoryCategory } from '@/lib/inventory/types';
import type { InventoryEntry } from './InventoryForm';
import { UndoToast } from '@/components/ui/UndoToast';
import { notifySuccess } from '@/lib/toast';
import { InventoryFilterBar, InventoryFilterToggleButton } from './InventoryFilterBar';
import { InventoryBulkBar, InventoryBulkToggleButton } from './InventoryBulkBar';
import { BulkWinesDialog, type BulkWinesActionName } from './BulkWinesDialog';
import { bulkSummary } from '@/lib/products/bulk';
import { InventoryListRowSkeleton } from './InventoryListRow';
import { InventoryGridView } from './InventoryGridView';
import { InventoryListView } from './InventoryListView';
import { InventoryStatsLine } from './InventoryStatsLine';
import { InventoryBanners } from './InventoryBanners';
import { TrashWineDialog } from './TrashWineDialog';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useViewMode } from '@/hooks/useViewMode';
import { usePageSize } from '@/hooks/usePageSize';
import { PageSizeToggle } from '@/components/ui/PageSizeToggle';

// Screens that only appear after an action are split out of the page's first
// load; they open behind a click, so a null placeholder is invisible. They are
// mounted only while open (#637): a `dynamic` component downloads its code as
// soon as it renders, open or not.
const EditWineDialog = dynamic(() => import('./EditWineDialog').then((m) => m.EditWineDialog), { ssr: false, loading: () => null });
const InventoryForm = dynamic(() => import('./InventoryForm').then((m) => m.InventoryForm), { ssr: false, loading: () => null });
const FamilyDrawer = dynamic(() => import('./FamilyDrawer').then((m) => m.FamilyDrawer), { ssr: false, loading: () => null });
const AddUnitsAction = dynamic(() => import('./AddUnitsDialog').then((m) => m.AddUnitsAction), { ssr: false, loading: () => null });
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
  const trashMutation = useTrashProduct();
  const restoreMutation = useRestoreProduct();
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

  const [mode, setMode] = useState<UIMode>('idle');
  const [scanOpen, setScanOpen] = useState(false);
  const scanAvailable = useScanAvailability();
  // #471 (FEAT-92 c4): "Modifier" edits the wine's description, for all its bottles.
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingFromDrawer, setEditingFromDrawer] = useState(false);
  // #471: the drawer shows a wine (family), any wine — one without bottle included.
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [undoTarget, setUndoTarget] = useState<Product | null>(null);

  const bulkUpdateMutation = useBulkUpdateInventoryItem();
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  // #471 (FEAT-111): "Déplacer", "Marquer comme bus", "Mettre à la corbeille" on the wines selected.
  const [winesAction, setWinesAction] = useState<BulkWinesActionName | null>(null);

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
    navCategory,
    collectionState: collectionStateOfList,
  } = useInventoryFilters({ products, cellars, lockedCategories, t, hasMounted });

  // #504: the counters answer "how many do I hold here?": the chosen section
  // only, what is in stock whatever the list shows ("Plus en cave" included),
  // and the bottles drunk or gone counted apart (§10.6).
  const inSection = useCallback(
    (category: string) =>
      (!lockedCategories?.length || lockedCategories.includes(category)) &&
      (selectedCategories.length === 0 || selectedCategories.includes(category)),
    [lockedCategories, selectedCategories],
  );
  const statsProducts = useMemo(
    () => (products ?? []).filter((p) => inSection(p.category) && !isGone(p)),
    [products, inSection],
  );
  const goneCount = useMemo(
    () => (items ?? []).reduce((count, item) => {
      if (item.deletedAt || !inSection(item.category)) return count;
      const out = (item as InventoryItem & { writtenOffAt?: string | null }).writtenOffAt;
      if (out) return count + Math.max(item.quantity ?? 1, 0);
      return isFinishedState({ isOpened: item.isOpened, fillLevel: item.fillLevel ?? null }) ? count + 1 : count;
    }, 0),
    [items, inSection],
  );

  // Auto-open from a QR scan or a notification (FEAT-10, a bottle's id) or
  // the search (a wine's id): the drawer of the wine, in both cases (#471).
  // Kept out of useInventoryFilters: it drives dashboard-local UI state.
  useEffect(() => {
    const scanParam = searchParams.get('scan');
    if (!scanParam || !products) return;
    let cancelled = false;
    const open = (productId: string | undefined) => {
      if (cancelled) return;
      const next = new URLSearchParams(searchParams.toString());
      next.delete('scan');
      if (productId) setViewingProductId(productId);
      // Remove ?scan= from URL to avoid reopening on refresh
      router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
    };
    const known = familyIdOf(scanParam, products, items);
    if (known) {
      open(known);
    } else {
      // A bottle the lists do not hold (beyond their cap, or not loaded yet).
      void inventoryClient.get(scanParam).then((item) => open(item.productId), () => open(undefined));
    }
    return () => { cancelled = true; };
  }, [searchParams, items, products, pathname, router]);

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

  // #471 (FEAT-97): a wine of the same name is proposed while typing ("Vous
  // avez déjà ce vin"); a submitted entry is a new wine, saved as the scan,
  // the first-run wizard and the cellar page save it (#690). A failure is
  // told by the mutation's toast and leaves the form open with the entry.
  const { create: createFromForm, isPending: isCreating } = useCreateFromForm();
  const handleCreate = useCallback(
    async (values: InventoryEntry, collectionIds: string[]) => {
      if (await createFromForm(values, collectionIds)) setMode('idle');
    },
    [createFromForm],
  );

  // The bulk edit (tags, presets) writes the bottles in stock of the wines
  // selected; the other bulk actions name the wines (BulkWinesDialog).
  const selectedItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const product of products ?? []) {
      if (selectedIds.has(product.id)) for (const unit of product.items) ids.add(unit.id);
    }
    return ids;
  }, [products, selectedIds]);

  const isCigarPage = Boolean(lockedCategories?.includes('cigar'));
  // FEAT-111: the wines still in the cellar and their bottles, as the bulk dialogs count them.
  const bulkSubtitle = useMemo(
    () => bulkSummary(products ?? [], selectedIds, isCigarPage, t),
    [products, selectedIds, isCigarPage, t],
  );

  const handleBulkApply = useCallback(
    (patch: Partial<InventoryItem>) => {
      // Wines with nothing left have no bottle to change.
      if (selectedItemIds.size === 0) return;
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


  // The description only: a bottle's field is never sent (the API refuses it).
  // Collections go to the wine (#471), with all its bottles.
  const handleUpdated = useCallback((product: Product) => {
    setMode('idle');
    setEditingProduct(null);
    // Opened from the drawer: back to it, which shows the new description.
    if (editingFromDrawer) setViewingProductId(product.id);
  }, [editingFromDrawer]);

  // "Mettre ce vin à la corbeille": the wine and all its bottles (D10), once
  // confirmed with the total (§10.4.7).
  const [trashTarget, setTrashTarget] = useState<Product | null>(null);
  const handleDelete = useCallback((product: Product) => setTrashTarget(product), []);
  const confirmTrash = useCallback(
    (product: Product) => {
      trashMutation.mutate(product.id, {
        onSuccess: () => {
          setTrashTarget(null);
          setUndoTarget(product);
        },
      });
    },
    [trashMutation]
  );

  const handleUndo = useCallback(() => {
    if (!undoTarget) return;
    restoreMutation.mutate(undoTarget.id);
    setUndoTarget(null);
  }, [undoTarget, restoreMutation]);


  // From a card or from the drawer: the wine as last known (the drawer's
  // detail is newer than the list right after a change).
  const startEdit = useCallback((product: Product, fromDrawer: boolean) => {
    setViewingProductId(null);
    setEditingProduct(product);
    setEditingFromDrawer(fromDrawer);
    setMode('editing');
  }, []);
  const handleEdit = useCallback((product: Product) => startEdit(product, false), [startEdit]);
  const handleEditFromDrawer = useCallback((product: Product) => startEdit(product, true), [startEdit]);

  const handleView = useCallback((product: Product) => setViewingProductId(product.id), []);
  const handleCancel = useCallback(() => {
    // Opened from the drawer: closing the form goes back to it.
    if (mode === 'editing' && editingFromDrawer && editingProduct) setViewingProductId(editingProduct.id);
    setMode('idle');
    setEditingProduct(null);
  }, [mode, editingFromDrawer, editingProduct]);

  const cellarNames = useMemo(() => new Map((cellars ?? []).map((c) => [c.id, c.name])), [cellars]);
  const cellarNameOf = useCallback((product: Product) => {
    const ids = new Set(product.items.map((unit) => unit.cellarId));
    const [only] = ids;
    return ids.size === 1 && only ? cellarNames.get(only) : undefined;
  }, [cellarNames]);
  // #707: the cellars looked at ("2 ici", what the drawer preselects), "Sans cave" not being one.
  const viewedCellarIds = useMemo(() => selectedCellars.filter((id) => id !== NO_CELLAR), [selectedCellars]);
  const stockOf = useCallback(
    (product: Product) => describeStock(product, t, {
      cellarIds: viewedCellarIds,
      formatDate: (iso) => formatDate(iso, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
    }),
    [t, viewedCellarIds, i18n.language],
  );
  // A cigars-only page speaks of cigars and the humidor, not of bottles.
  const emptyCtx = lockedCategories?.length === 1 && lockedCategories[0] === 'cigar' ? { context: 'cigar' } : undefined;
  const categoryLabel = (cat: string) => t(`categories.${cat}`);
  const activeCollectionName = selectedCollectionId ? (allCollections?.find(c => c.id === selectedCollectionId)?.name ?? '') : '';
  // #708: a collection with no wine, or only finished ones, is not "no result
  // for these filters", whose "Reset filters" would drop the collection. Not
  // said when the list is cut: the collection's wines may be the ones missing.
  const collectionState = productsTruncated ? null : collectionStateOfList;

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
      <InventoryBanners t={t} isTruncated={isTruncated} cellars={cellars} />

      {!isLoading && (statsProducts.length > 0 || goneCount > 0) && mode === 'idle' && (
        <InventoryStatsLine
          products={statsProducts}
          goneCount={goneCount}
          isCigarPage={Boolean(lockedCategories?.includes('cigar'))}
          pageCategories={selectedCategories.length > 0 ? selectedCategories : lockedCategories}
          t={t}
        />
      )}

      {/* Main layout */}
      <div className="flex gap-5 items-start">
        {/* Desktop filter panel. #701: the page's sections, named for screen readers. */}
        <h2 className="sr-only">{t('inventory.headings.filters')}</h2>
        <InventoryFilterBar variant="desktop" {...filterBarProps} />

        {/* Content column */}
        <div className="flex-1 min-w-0">
          <h2 className="sr-only">{t('inventory.headings.list')}</h2>
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
              {/* #708: an empty cellar has nothing to page through. */}
              {products && products.length > 0 && (<>
                {!isMobile && <div className="w-px h-5 bg-divider" />}
                <PageSizeToggle value={pageSize} onChange={setPageSize} />
              </>)}
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
          {mode === 'creating' && (
            <InventoryForm
              open
              defaultCategory={
                lockedCategories?.length === 1
                  ? (lockedCategories[0] as InventoryCategory)
                  : selectedCategories.length === 1
                  ? (selectedCategories[0] as InventoryCategory)
                  : undefined
              }
              onSubmit={handleCreate}
              onClose={handleCancel}
              isSubmitting={isCreating}
              t={t}
              onScanRequested={scanAvailable ? () => { setMode('idle'); setScanOpen(true); } : undefined}
            />
          )}
          {mode === 'editing' && editingProduct && (
            <EditWineDialog product={editingProduct} onClose={handleCancel} onSaved={handleUpdated} />
          )}

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
              {/* #503: `?category=` is the page, not a filter: an empty category
                  page gets its own empty state (Add, and a way to all bottles). */}
              {products && navCategory && CATEGORY_TITLES[navCategory] && filteredItems.length === 0 && !hasActiveFilters && !collectionState ? (
                <EmptyState
                  bordered
                  title={t(`inventory.noCategory_${navCategory}`)}
                  description={t(`inventory.noCategory_${navCategory}Desc`)}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button color="primary" startContent={<Plus size={16} />} onPress={() => setMode('creating')}>
                        {t('inventory.add')}
                      </Button>
                      <Button variant="light" color="primary" data-testid="see-all-bottles" onPress={() => router.push('/bottles')}>
                        {t('inventory.seeAllBottles')}
                      </Button>
                    </div>
                  }
                />
              ) : products && baseItems.length === 0 && !hasActiveFilters ? (
                <EmptyState
                  bordered
                  title={t('inventory.noBottles', emptyCtx)}
                  description={t('inventory.noBottlesDesc', emptyCtx)}
                  action={
                    <Button color="primary" startContent={<Plus size={16} />} onPress={() => setMode('creating')}>
                      {t('inventory.add')}
                    </Button>
                  }
                />
              ) : collectionState ? (
                <EmptyState
                  icon={<BookMarked size={56} className="text-default-200" />}
                  title={t(collectionState === 'empty' ? 'collections.emptyCollection' : 'collections.allGoneCollection')}
                  description={t(collectionState === 'empty' ? 'collections.emptyCollectionHint' : 'collections.allGoneCollectionHint')}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {collectionState === 'allGone' && (
                        <Button variant="flat" color="primary" onPress={() => setShowGone(true)}>
                          {t('collections.showGone')}
                        </Button>
                      )}
                      <Button variant="light" color="primary" data-testid="back-to-collections" onPress={() => router.push('/collections')}>
                        {t('collections.backToCollections')}
                      </Button>
                    </div>
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
          message={t('familyList.trash.done', { name: wineName(undoTarget) })}
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
        wineSelection
        subtitle={bulkSubtitle}
        items={items}
        isBulkDialogOpen={isBulkDialogOpen}
        onOpenDialog={() => setIsBulkDialogOpen(true)}
        onCloseDialog={() => setIsBulkDialogOpen(false)}
        onApply={handleBulkApply}
        isSubmitting={bulkUpdateMutation.isPending}
        onWinesAction={setWinesAction}
        cigars={isCigarPage}
      />
      <BulkWinesDialog
        action={winesAction}
        products={products ?? []}
        selectedIds={selectedIds}
        cigars={isCigarPage}
        viewedCellarIds={viewedCellarIds}
        onClose={() => setWinesAction(null)}
        onDone={() => {
          setWinesAction(null);
          setBulkMode(false);
          clearSelection();
        }}
      />

      <TrashWineDialog
        product={trashTarget}
        onConfirm={confirmTrash}
        onClose={() => setTrashTarget(null)}
        isPending={trashMutation.isPending}
        t={t}
      />

      {viewingProductId && (
        <FamilyDrawer
          productId={viewingProductId}
          onClose={() => setViewingProductId(null)}
          onEdit={handleEditFromDrawer}
          // FEAT-104 c3: "Quelles bouteilles ?" preselects the line of the cellars filtered on.
          viewedCellarIds={viewedCellarIds}
          // #471 (FEAT-92 c2, FEAT-101 c3, FEAT-95): "Ajouter des bouteilles" / "Ajouter des cigares".
          primaryAction={(product) => <AddUnitsAction product={product} />}
        />
      )}

      {scanOpen && <ScanFlow open onClose={() => setScanOpen(false)} t={t} />}
    </div>
  );
}
