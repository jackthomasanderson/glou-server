'use client';
import React, { useState, useCallback } from 'react';
import {
  Box, Button, Container, Fab,
  Grid, Typography, Collapse, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Bottle } from '@/lib/bottles/types';
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
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';

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

  const [mode, setMode] = useState<UIMode>('idle');
  const [editingBottle, setEditingBottle] = useState<Bottle | null>(null);

  // Undo toast state
  const [undoTarget, setUndoTarget] = useState<Bottle | null>(null);

  // Bulk mode state
  const bulkUpdateMutation = useBulkUpdateBottle();
  const [bulkMode, setBulkMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSelectToggle = useCallback((bottle: Bottle) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bottle.id)) next.delete(bottle.id);
      else next.add(bottle.id);
      return next;
    });
  }, []);

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
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          variant={bulkMode ? "contained" : "outlined"}
          color={bulkMode ? "secondary" : "primary"}
          startIcon={bulkMode ? <CloseIcon /> : <FormatListBulletedIcon />}
          onClick={toggleBulkMode}
          sx={{ display: bottles && bottles.length > 0 ? 'flex' : 'none' }}
        >
          {bulkMode ? t('actions.cancel') : t('actions.select')}
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setMode('creating')}
          sx={{ display: { xs: 'none', sm: 'flex' } }}
          aria-label={t('bottle.add')}
          disabled={!hasCellars || bulkMode}
        >
          {t('bottle.add')}
        </Button>
      </Box>

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

      {/* Empty state */}
      {!isLoading && !isError && bottles?.length === 0 && mode === 'idle' && (
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
      )}

      {/* Bottle grid */}
      {!isLoading && bottles && bottles.length > 0 && (
        <Grid container spacing={2}>
          {bottles.map((bottle) => (
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
            {t('bottle.bulk.selected', { count: selectedIds.size })}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 160, flexGrow: 1 }}>
            <InputLabel>{t('nav.caves')}</InputLabel>
            <Select
              label={t('nav.caves')}
              value=""
              onChange={(e) => {
                const targetCellarId = e.target.value;
                if (!targetCellarId) return;
                bulkUpdateMutation.mutate({
                  ids: Array.from(selectedIds),
                  patch: { cellarId: targetCellarId === 'none' ? null : targetCellarId }
                }, {
                  onSuccess: () => {
                    setBulkMode(false);
                    setSelectedIds(new Set());
                  }
                });
              }}
              displayEmpty
            >
              <MenuItem value="" disabled sx={{ display: 'none' }}>
              </MenuItem>
              <MenuItem value="none">
                <em>{t('bottle.noCellar')}</em>
              </MenuItem>
              {cellars?.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}
    </Container>
  );
}
