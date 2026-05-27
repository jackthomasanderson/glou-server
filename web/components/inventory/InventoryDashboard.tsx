'use client';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Box, Button, Container, Fab,
  Grid, Typography, Collapse, Alert, IconButton,
  Stack, Chip, Divider, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  useTheme, useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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
import Link from 'next/link';
import { InventoryCard, InventoryCardSkeleton } from './InventoryCard';
import { InventoryForm } from './InventoryForm';
import { UndoToast } from '@/components/ui/UndoToast';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import { BulkActionDialog } from './BulkActionDialog';
import { AlertCenter } from './AlertCenter';
import { InventoryDetailDialog } from './InventoryDetailDialog';
import { InventoryListRow, InventoryListRowSkeleton } from './InventoryListRow';
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

  // Undo toast state
  const [undoTarget, setUndoTarget] = useState<InventoryItem | null>(null);

  // Bulk mode state
  const bulkUpdateMutation = useBulkUpdateInventoryItem();
  const [bulkMode, setBulkMode] = useState<boolean>(false);
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [openedFilter, setOpenedFilter] = useState<'all' | 'full' | 'opened' | 'alerts'>('all');

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    const qParam = searchParams.get('q');
    const collectionParam = searchParams.get('collection');
    if (qParam) {
      setSearchQuery(qParam);
    }
    setSelectedCollectionId(collectionParam ?? null);
    if (filterParam === 'opened') {
      setOpenedFilter('opened');
      setIsFiltersOpen(true);
    } else if (filterParam === 'full') {
      setOpenedFilter('full');
      setIsFiltersOpen(true);
    } else if (filterParam === 'alerts') {
      setOpenedFilter('alerts');
      setIsFiltersOpen(true);
    } else {
      setOpenedFilter('all');
    }
  }, [searchParams]);

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode('inventory');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const effectiveViewMode = isMobile ? 'grid' : viewMode;

  const toggleFilters = useCallback(() => {
    setIsFiltersOpen((prev) => !prev);
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  const toggleCellar = useCallback((cellarId: string) => {
    setSelectedCellars((prev) =>
      prev.includes(cellarId)
        ? prev.filter((id) => id !== cellarId)
        : [...prev, cellarId]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategories([]);
    setSelectedCellars([]);
    setOpenedFilter('all');
    router.push(pathname);
  }, [router, pathname]);

  const filteredItems = useMemo(() => {
    if (!items) return [];

    let result = items;

    // 0. Locked category filter (set by parent, not user-controlled)
    if (lockedCategories && lockedCategories.length > 0) {
      result = result.filter((b: InventoryItem) => lockedCategories.includes(b.category));
    }

    // 0b. Collection filter (from URL param)
    if (selectedCollectionId) {
      result = result.filter((b: InventoryItem) =>
        (b.collections ?? []).some(c => c.id === selectedCollectionId)
      );
    }

    // 1. Category Filter
    if (selectedCategories.length > 0) {
      result = result.filter((b: InventoryItem) => selectedCategories.includes(b.category));
    }

    // 2. Cellar Filter
    if (selectedCellars.length > 0) {
      result = result.filter((b: InventoryItem) => selectedCellars.includes(b.cellarId || ''));
    }

    // 2b. Opened Filter
    if (openedFilter === 'full') {
      result = result.filter((b: InventoryItem) => !b.isOpened);
    } else if (openedFilter === 'opened') {
      result = result.filter((b: InventoryItem) => b.isOpened);
    } else if (openedFilter === 'alerts') {
      if (!hasMounted) return [];
      const today = new Date().toISOString().split('T')[0];
      result = result.filter((b: InventoryItem) => b.reminderDate && b.reminderDate.split('T')[0] <= today);
    }

    // 3. Text Search
    if (searchQuery.trim()) {
      const normalize = (s: string) =>
        s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const q = normalize(searchQuery);

      result = result.filter((b: InventoryItem) => {
        const cellar = cellars?.find((c: Cellar) => c.id === b.cellarId);
        const cellarName = cellar ? normalize(cellar.name) : '';

        const searchStrings = [
          b.name,
          b.producer,
          b.vintage?.toString(),
          t(`categories.${b.category}`),
          b.region,
          cellarName,
          ...(b.collections ?? []).map(c => c.name),
          ...(b.tags || [])
        ].filter(Boolean) as string[];

        return searchStrings.some((s: string) => normalize(s).includes(q));
      });
    }

    return result;
  }, [items, searchQuery, selectedCategories, selectedCellars, selectedCollectionId, cellars, openedFilter, t, hasMounted, lockedCategories]);


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
      if (collectionIds.length > 0) {
        await syncCollections(created.id, collectionIds, []);
      }
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
    if (collIds.length > 0) {
      await syncCollections(created.id, collIds, []);
    }
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
      deleteMutation.mutate(item.id, {
        onSuccess: () => setUndoTarget(item),
      });
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

  const handleView = useCallback((item: InventoryItem) => {
    setViewingItem(item);
  }, []);

  const handleCancel = useCallback(() => {
    setMode('idle');
    setEditingItem(null);
  }, []);

  const hasCellars = (cellars?.length ?? 0) > 0;
  const categoryLabel = (cat: string) => t(`categories.${cat}`);
  const hasActiveFilters = selectedCategories.length > 0 || selectedCellars.length > 0 || openedFilter !== 'all' || !!searchQuery || !!selectedCollectionId;
  const activeCollectionName = selectedCollectionId ? (allCollections?.find(c => c.id === selectedCollectionId)?.name ?? '') : '';

  const filterContent = (
    <Stack spacing={2}>
      {!lockedCategories && (
        <Box>
          <Typography variant="subtitle2" gutterBottom color="text.secondary">
            {t('inventory.filterByCategory')}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {['wine', 'sparkling', 'spirit', 'cigar'].map((cat) => (
              <Chip
                key={cat}
                label={t(`categories.${cat}`)}
                onClick={() => toggleCategory(cat)}
                color={selectedCategories.includes(cat) ? "primary" : "default"}
                variant={selectedCategories.includes(cat) ? "filled" : "outlined"}
                size="small"
              />
            ))}
          </Stack>
        </Box>
      )}

      {hasCellars && (
        <Box>
          <Typography variant="subtitle2" gutterBottom color="text.secondary">
            {t('inventory.filterByCellar')}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {cellars?.map((cellar) => (
              <Chip
                key={cellar.id}
                label={cellar.name}
                onClick={() => toggleCellar(cellar.id)}
                color={selectedCellars.includes(cellar.id) ? "primary" : "default"}
                variant={selectedCellars.includes(cellar.id) ? "filled" : "outlined"}
                size="small"
              />
            ))}
          </Stack>
        </Box>
      )}

      <Box>
        <Typography variant="subtitle2" gutterBottom color="text.secondary">
          {t('inventory.fields.isOpened')}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {['all', 'full', 'opened', 'alerts'].map((f) => (
            <Chip
              key={f}
              label={t(`inventory.filters.${f}`)}
              onClick={() => setOpenedFilter(f as typeof openedFilter)}
              color={openedFilter === f ? "primary" : "default"}
              variant={openedFilter === f ? "filled" : "outlined"}
              size="small"
            />
          ))}
        </Stack>
      </Box>

      {hasActiveFilters && (
        <>
          <Divider />
          <Button
            size="small"
            onClick={clearFilters}
            startIcon={<CloseIcon />}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('actions.clearAll')}
          </Button>
        </>
      )}
    </Stack>
  );

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
      <Box sx={{ mb: { xs: 2, sm: 3 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Left: filter (mobile) / view toggle (desktop) */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <IconButton
            onClick={toggleFilters}
            color={isFiltersOpen || hasActiveFilters ? "secondary" : "default"}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, display: { md: 'none' } }}
          >
            <FilterListIcon />
          </IconButton>
          {!isMobile && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </Box>

        {/* Right: select + add */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant={bulkMode ? "contained" : "outlined"}
            color={bulkMode ? "secondary" : "primary"}
            startIcon={bulkMode ? <CloseIcon /> : <FormatListBulletedIcon />}
            onClick={toggleBulkMode}
            size={isMobile ? "small" : "medium"}
            sx={{ display: items && items.length > 0 ? 'flex' : 'none' }}
          >
            {bulkMode ? t('actions.cancel') : t('actions.select')}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setMode('creating')}
            sx={{ display: { xs: 'none', sm: 'flex' } }}
            aria-label={t('inventory.add')}
            disabled={!hasCellars || bulkMode}
          >
            {t('inventory.add')}
          </Button>
        </Box>
      </Box>

      {/* Mobile: collapsible filter panel */}
      <Box sx={{ display: { md: 'none' } }}>
        <Collapse in={isFiltersOpen} unmountOnExit>
          <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            {filterContent}
          </Paper>
        </Collapse>
      </Box>

      {/* Main layout: sidebar + content */}
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        {/* Desktop sidebar: permanent filters */}
        <Box sx={{ width: 220, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, position: 'sticky', top: 80 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              {t('actions.filter')}
            </Typography>
            {filterContent}
          </Paper>
        </Box>

        {/* Content area */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Alert center: drinking window notifications */}
          {mode === 'idle' && <AlertCenter t={t} />}

          {/* Error state */}
          {isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {t('status.error')}
            </Alert>
          )}

          {/* Collection filter banner */}
          {selectedCollectionId && activeCollectionName && (
            <Box sx={{ mb: 2 }}>
              <Chip
                label={t('collections.filterActive', { name: activeCollectionName })}
                onDelete={() => router.push(pathname)}
                color="primary"
                variant="outlined"
                size="small"
              />
            </Box>
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
            <Grid container spacing={{ xs: 1.5, sm: 2 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Grid item xs={6} sm={6} md={4} key={i}>
                  <InventoryCardSkeleton />
                </Grid>
              ))}
            </Grid>
          )}
          {isLoading && effectiveViewMode === 'list' && (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableBody>
                  {Array.from({ length: 8 }).map((_, i) => <InventoryListRowSkeleton key={i} />)}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Empty state or No results */}
          {!isLoading && !isError && mode === 'idle' && (
            <>
              {items?.length === 0 ? (
                <Box
                  sx={{
                    textAlign: 'center',
                    py: 8,
                    border: '2px dashed',
                    borderColor: 'divider',
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                  }}
                >
                  {hasCellars ? (
                    <>
                      <Typography variant="h6" color="text.secondary" gutterBottom>
                        {t('inventory.noBottles')}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('inventory.noBottlesDesc')}
                      </Typography>
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setMode('creating')}
                      >
                        {t('inventory.add')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Typography variant="h6" color="text.secondary" gutterBottom>
                        {t('inventory.createCellarFirst')}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {t('inventory.createCellarFirstDesc')}
                      </Typography>
                      <Button
                        variant="contained"
                        startIcon={<WarehouseIcon />}
                        component={Link}
                        href="/cellars"
                      >
                        {t('nav.caves')}
                      </Button>
                    </>
                  )}
                </Box>
              ) : (
                searchQuery.trim() && filteredItems.length === 0 && (
                  <Box sx={{ textAlign: 'center', py: 8 }}>
                    <SearchIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                      {t('inventory.noResults', { query: searchQuery })}
                    </Typography>
                  </Box>
                )
              )}
            </>
          )}

          {/* Stats summary */}
          {!isLoading && items && items.length > 0 && mode === 'idle' && (
            <Box sx={{ mb: 3, display: 'flex', gap: { xs: 1, sm: 2 } }}>
              <Paper variant="outlined" sx={{ flex: 1, p: { xs: 1.5, sm: 2 }, borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.1 }}>
                  {items.length}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, lineHeight: 1.2 }}>
                  {t('inventory.stats.total')}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ flex: 1, p: { xs: 1.5, sm: 2 }, borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="h5" fontWeight={700} color="success.main" sx={{ lineHeight: 1.1 }}>
                  {items.filter(b => !b.isOpened).length}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, lineHeight: 1.2 }}>
                  {t('inventory.stats.full')}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ flex: 1, p: { xs: 1.5, sm: 2 }, borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="h5" fontWeight={700} color="warning.main" sx={{ lineHeight: 1.1 }}>
                  {items.filter(b => b.isOpened).length}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, lineHeight: 1.2 }}>
                  {t('inventory.stats.opened')}
                </Typography>
              </Paper>
            </Box>
          )}

          {/* Inventory grid */}
          {!isLoading && filteredItems && filteredItems.length > 0 && effectiveViewMode === 'grid' && (
            <Grid container spacing={{ xs: 1.5, sm: 2 }}>
              {filteredItems.map((item: InventoryItem) => (
                <Grid item xs={6} sm={6} md={4} key={item.id}>
                  <InventoryCard
                    item={item}
                    categoryLabel={categoryLabel(item.category)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onView={bulkMode ? undefined : handleView}
                    t={t}
                    isSelected={selectedIds.has(item.id)}
                    onSelectToggle={bulkMode ? handleSelectToggle : undefined}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          {/* Inventory list */}
          {!isLoading && filteredItems && filteredItems.length > 0 && effectiveViewMode === 'list' && (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {bulkMode && <TableCell padding="checkbox" />}
                    <TableCell sx={{ width: 40 }} />
                    <TableCell>{t('inventory.fields.name')}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('inventory.fields.producer')}</TableCell>
                    <TableCell align="center">{t('inventory.fields.vintage')}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('inventory.fields.region')}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('view.columns.cellar')}</TableCell>
                    <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('view.columns.peak')}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('view.columns.status')}</TableCell>
                    <TableCell align="right">{t('admin.maturityRefs.columns.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredItems.map((item: InventoryItem) => (
                    <InventoryListRow
                      key={item.id}
                      item={item}
                      categoryLabel={categoryLabel(item.category)}
                      cellar={cellars?.find((c: Cellar) => c.id === item.cellarId) ?? undefined}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onView={bulkMode ? undefined : handleView}
                      t={t}
                      isSelected={selectedIds.has(item.id)}
                      onSelectToggle={bulkMode ? handleSelectToggle : undefined}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>

      {/* FAB for mobile */}
      <Fab
        color="primary"
        aria-label={t('inventory.add')}
        sx={{ position: 'fixed', bottom: { xs: 72, md: 24 }, right: 16, display: { sm: 'none' } }}
        onClick={() => setMode('creating')}
        disabled={!hasCellars}
      >
        <AddIcon />
      </Fab>

      {/* Undo toast (soft delete) */}
      {undoTarget && (
        <UndoToast
          message={t('toast.deleteSuccess')}
          undoLabel={t('actions.undo')}
          onUndo={handleUndo}
          onExpire={() => setUndoTarget(null)}
        />
      )}

      {/* Bulk success toast */}
      {bulkSuccessCount !== null && (
        <UndoToast
          message={t('bulk.success', { count: bulkSuccessCount })}
          undoLabel={t('actions.close')}
          onUndo={() => setBulkSuccessCount(null)}
          onExpire={() => setBulkSuccessCount(null)}
        />
      )}

      {/* Bulk action bar */}
      {bulkMode && selectedIds.size > 0 && (
        <Box
          sx={{
            position: 'fixed',
            bottom: { xs: 72, md: 24 },
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1200,
            bgcolor: 'background.paper',
            p: 2,
            borderRadius: 2,
            boxShadow: 4,
            display: 'flex',
            gap: 3,
            alignItems: 'center',
            minWidth: { xs: 'calc(100vw - 32px)', sm: 320 },
          }}
        >
          <Typography fontWeight="bold" color="primary">
            {t('bulk.selected', { count: selectedIds.size })}
          </Typography>
          <Button
            variant="contained"
            onClick={() => setIsBulkDialogOpen(true)}
          >
            {t('bulk.title')}
          </Button>
        </Box>
      )}

      {/* Bulk Action Dialog */}
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
    </Container>
  );
}
