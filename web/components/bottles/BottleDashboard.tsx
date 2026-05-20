'use client';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';

import { useSearchParams, useRouter } from 'next/navigation';
import {
  Box, Button, Container, Fab,
  Grid, Typography, Collapse, Alert, IconButton, InputBase,
  Stack, Chip, Divider, Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { Bottle } from '@/lib/bottles/types';
import { Cellar } from '@/lib/cellars/types';
import {
  useBottles,
  useCreateBottle,
  useUpdateBottle,
  useDeleteBottle,
  useRestoreBottle,
  useBulkUpdateBottle,
} from '@/hooks/useBottles';
import { useCellars } from '@/hooks/useCellars';
import Link from 'next/link';
import { BottleCard, BottleCardSkeleton } from './BottleCard';
import { BottleForm } from './BottleForm';
import { UndoToast } from '@/components/ui/UndoToast';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import { BulkActionDialog } from './BulkActionDialog';
import { AlertCenter } from './AlertCenter';

type UIMode = 'idle' | 'creating' | 'editing';

interface BottleDashboardProps {
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * Page principale du CRUD bouteilles.
 * Gère : liste, création, édition, suppression avec Undo, Optimistic UI.
 */
export function BottleDashboard({ t }: BottleDashboardProps) {
  const { data: bottles, isLoading, isError } = useBottles();
  const { data: cellars } = useCellars();
  const createMutation = useCreateBottle();
  const updateMutation = useUpdateBottle();
  const deleteMutation = useDeleteBottle();
  const restoreMutation = useRestoreBottle();
  const hasMounted = useHasMounted();


  const [mode, setMode] = useState<UIMode>('idle');
  const [editingBottle, setEditingBottle] = useState<Bottle | null>(null);

  // Undo toast state
  const [undoTarget, setUndoTarget] = useState<Bottle | null>(null);

  // Bulk mode state
  const bulkUpdateMutation = useBulkUpdateBottle();
  const [bulkMode, setBulkMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkSuccessCount, setBulkSuccessCount] = useState<number | null>(null);

  const handleSelectToggle = useCallback((bottle: Bottle) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bottle.id)) next.delete(bottle.id);
      else next.add(bottle.id);
      return next;
    });
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCellars, setSelectedCellars] = useState<string[]>([]);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [openedFilter, setOpenedFilter] = useState<'all' | 'full' | 'opened' | 'alerts'>('all');

  useEffect(() => {
    const filterParam = searchParams.get('filter');
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

  const toggleSearch = useCallback(() => {
    setIsSearchOpen((prev) => !prev);
    if (!isSearchOpen === false) setSearchQuery('');
  }, [isSearchOpen]);

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
    router.push('/bottles');
  }, [router]);

  const filteredBottles = useMemo(() => {
    if (!bottles) return [];

    let result = bottles;

    // 1. Category Filter
    if (selectedCategories.length > 0) {
      result = result.filter((b: Bottle) => selectedCategories.includes(b.category));
    }

    // 2. Cellar Filter
    if (selectedCellars.length > 0) {
      result = result.filter((b: Bottle) => selectedCellars.includes(b.cellarId || ''));
    }

    // 2b. Opened Filter
    if (openedFilter === 'full') {
      result = result.filter((b: Bottle) => !b.isOpened);
    } else if (openedFilter === 'opened') {
      result = result.filter((b: Bottle) => b.isOpened);
    } else if (openedFilter === 'alerts') {
      if (!hasMounted) return [];
      const today = new Date().toISOString().split('T')[0];
      result = result.filter((b: Bottle) => b.reminderDate && b.reminderDate.split('T')[0] <= today);
    }


    // 3. Text Search
    if (searchQuery.trim()) {
      const normalize = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const q = normalize(searchQuery);

      result = result.filter((b: Bottle) => {
        const cellar = cellars?.find((c: Cellar) => c.id === b.cellarId);
        const cellarName = cellar ? normalize(cellar.name) : '';

        const searchStrings = [
          b.name,
          b.producer,
          b.vintage?.toString(),
          t(`categories.${b.category}`),
          b.region,
          b.collection,
          cellarName,
          ...(b.tags || [])
        ].filter(Boolean) as string[];

        return searchStrings.some((s: string) => normalize(s).includes(q));
      });
    }

    return result;
  }, [bottles, searchQuery, selectedCategories, selectedCellars, cellars, openedFilter, t, hasMounted]);


  const toggleBulkMode = useCallback(() => {
    setBulkMode((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  const handleCreate = useCallback(
    (values: Partial<Bottle>) => {
      createMutation.mutate(values as Bottle, {
        onSettled: () => setMode('idle'),
      });
      setMode('idle');
    },
    [createMutation]
  );

  const handleBulkApply = useCallback(
    (patch: Partial<Bottle>) => {
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
    (values: Partial<Bottle>) => {
      if (!editingBottle) return;
      updateMutation.mutate(
        { id: editingBottle.id, patch: values },
        { onSettled: () => { setMode('idle'); setEditingBottle(null); } }
      );
    },
    [editingBottle, updateMutation]
  );

  const handleDelete = useCallback(
    (bottle: Bottle) => {
      deleteMutation.mutate(bottle.id, {
        onSuccess: () => setUndoTarget(bottle),
      });
    },
    [deleteMutation]
  );

  const handleUndo = useCallback(() => {
    if (!undoTarget) return;
    restoreMutation.mutate(undoTarget.id);
    setUndoTarget(null);
  }, [undoTarget, restoreMutation]);

  const handleEdit = useCallback((bottle: Bottle) => {
    setEditingBottle(bottle);
    setMode('editing');
  }, []);

  const handleCancel = useCallback(() => {
    setMode('idle');
    setEditingBottle(null);
  }, []);

  const hasCellars = (cellars?.length ?? 0) > 0;
  const categoryLabel = (cat: string) => t(`categories.${cat}`);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header handled by Navbar, keeping only specific actions if needed or removing extra space */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end', gap: 2, alignItems: 'center' }}>
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.3s ease-in-out',
          width: isSearchOpen ? { xs: '100%', sm: 300 } : 40,
          overflow: 'hidden',
          bgcolor: isSearchOpen ? 'background.paper' : 'transparent',
          borderRadius: 2,
          border: isSearchOpen ? '1px solid' : 'none',
          borderColor: 'divider',
          px: isSearchOpen ? 1 : 0,
        }}>
          <IconButton onClick={toggleSearch} color={isSearchOpen ? "primary" : "default"}>
            {isSearchOpen ? <ClearIcon /> : <SearchIcon />}
          </IconButton>
          {isSearchOpen && (
            <InputBase
              autoFocus
              fullWidth
              placeholder={t('bottle.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ ml: 1, flex: 1 }}
            />
          )}
        </Box>

        <IconButton 
          onClick={toggleFilters} 
          color={isFiltersOpen || selectedCategories.length > 0 || selectedCellars.length > 0 ? "secondary" : "default"}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
        >
          <FilterListIcon />
        </IconButton>

        <Button
          variant={bulkMode ? "contained" : "outlined"}
          color={bulkMode ? "secondary" : "primary"}
          startIcon={bulkMode ? <CloseIcon /> : <FormatListBulletedIcon />}
          onClick={toggleBulkMode}
          sx={{ display: bottles && bottles.length > 0 && !isSearchOpen ? 'flex' : 'none' }}
        >
          {bulkMode ? t('actions.cancel') : t('actions.select')}
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setMode('creating')}
          sx={{ display: isSearchOpen ? { xs: 'none', md: 'flex' } : { xs: 'none', sm: 'flex' } }}
          aria-label={t('bottle.add')}
          disabled={!hasCellars || bulkMode}
        >
          {t('bottle.add')}
        </Button>
      </Box>

      {/* Filters panel */}
      <Collapse in={isFiltersOpen} unmountOnExit>
        <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" gutterBottom color="text.secondary">
                {t('bottle.filterByCategory')}
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

            {hasCellars && (
              <Box>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  {t('bottle.filterByCellar')}
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
                {t('bottle.fields.isOpened')}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {['all', 'full', 'opened', 'alerts'].map((f) => (
                  <Chip
                    key={f}
                    label={t(`bottle.filters.${f}`)}
                    onClick={() => setOpenedFilter(f as typeof openedFilter)}
                    color={openedFilter === f ? "primary" : "default"}
                    variant={openedFilter === f ? "filled" : "outlined"}
                    size="small"
                  />
                ))}
              </Stack>
            </Box>

            {(selectedCategories.length > 0 || selectedCellars.length > 0 || openedFilter !== 'all' || searchQuery) && (
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
        </Paper>
      </Collapse>

      {/* Alert center: drinking window notifications */}
      {mode === 'idle' && <AlertCenter t={t} />}

      {/* Error state */}
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('status.error')}
        </Alert>
      )}

      {/* Form panel */}
      <Collapse in={mode !== 'idle'} unmountOnExit>
        <Box sx={{ mb: 3 }}>
          <BottleForm
            initialValues={mode === 'editing' && editingBottle ? editingBottle : undefined}
            onSubmit={mode === 'creating' ? handleCreate : handleUpdate}
            onCancel={handleCancel}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            t={t}
          />
        </Box>
      </Collapse>

      {/* Loading skeletons */}
      {isLoading && (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <BottleCardSkeleton />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Empty state or No results */}
      {!isLoading && !isError && mode === 'idle' && (
        <>
          {bottles?.length === 0 ? (
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
                    {t('bottle.noBottles')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {t('bottle.noBottlesDesc')}
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setMode('creating')}
                  >
                    {t('bottle.add')}
                  </Button>
                </>
              ) : (
                <>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    {t('bottle.createCellarFirst')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    {t('bottle.createCellarFirstDesc')}
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
            searchQuery.trim() && filteredBottles.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <SearchIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">
                  {t('bottle.noResults', { query: searchQuery })}
                </Typography>
              </Box>
            )
          )}
        </>
      )}

      {/* Stats summary */}
      {!isLoading && bottles && bottles.length > 0 && mode === 'idle' && (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={3} divider={<Divider orientation="vertical" flexItem />}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('bottle.stats.total')}
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                {bottles.length}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('bottle.stats.full')}
              </Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">
                {bottles.filter(b => !b.isOpened).length}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('bottle.stats.opened')}
              </Typography>
              <Typography variant="h6" fontWeight={700} color="warning.main">
                {bottles.filter(b => b.isOpened).length}
              </Typography>
            </Box>
          </Stack>
        </Box>
      )}

      {/* Bottle grid */}
      {!isLoading && filteredBottles && filteredBottles.length > 0 && (
        <Grid container spacing={2}>
          {filteredBottles.map((bottle: Bottle) => (
            <Grid item xs={12} sm={6} md={4} key={bottle.id}>
              <BottleCard
                bottle={bottle}
                categoryLabel={categoryLabel(bottle.category)}
                onEdit={handleEdit}
                onDelete={handleDelete}
                t={t}
                isSelected={selectedIds.has(bottle.id)}
                onSelectToggle={bulkMode ? handleSelectToggle : undefined}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* FAB for mobile */}
      <Fab
        color="primary"
        aria-label={t('bottle.add')}
        sx={{ position: 'fixed', bottom: 80, right: 24, display: { sm: 'none' } }}
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
            bottom: 24,
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
            minWidth: 320,
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
        selectedBottles={bottles?.filter(b => selectedIds.has(b.id)) || []}
        onApply={handleBulkApply}
        isSubmitting={bulkUpdateMutation.isPending}
        t={t}
      />
    </Container>
  );
}
