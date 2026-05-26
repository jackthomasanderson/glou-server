'use client';
import React, { useState } from 'react';
import {
  Box, Container, Typography, Grid, Fab, CircularProgress, Alert,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Pagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import { useTastings, useDeleteTasting } from '@/hooks/useTastings';
import { TastingNote, TastingFormValues } from '@/lib/tastings/types';
import { TastingCard } from './TastingCard';
import { TastingForm } from './TastingForm';
import { useTranslation } from 'react-i18next';

export function TastingsDashboard() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TastingNote | null>(null);
  const [deleting, setDeleting] = useState<TastingNote | null>(null);

  const { data, isLoading, isError } = useTastings(page);
  const deleteMutation = useDeleteTasting();

  const handleEdit = (note: TastingNote) => setEditing(note);

  const handleDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    setDeleting(null);
  };

  const editValues: { id: string; values: TastingFormValues } | undefined = editing
    ? {
        id: editing.id,
        values: {
          itemId: editing.itemId ?? undefined,
          tastedAt: editing.tastedAt.split('T')[0],
          context: editing.context ?? '',
          rating: editing.rating ?? null,
          notes: editing.notes ?? '',
          foodPairing: editing.foodPairing ?? '',
          photoUrl: editing.photoUrl ?? null,
        },
      }
    : undefined;

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <LocalBarIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>{t('tastings.title')}</Typography>
        {data && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
            {t('tastings.total', { count: data.total })}
          </Typography>
        )}
      </Box>

      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('tastings.errors.load')}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !data?.notes.length ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <LocalBarIcon sx={{ fontSize: 64, color: 'action.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">{t('tastings.empty')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('tastings.emptyHint')}
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
            {t('tastings.create')}
          </Button>
        </Box>
      ) : (
        <>
          <Grid container spacing={2}>
            {data.notes.map((note) => (
              <Grid item key={note.id} xs={12} sm={6} md={4}>
                <TastingCard note={note} onEdit={handleEdit} onDelete={setDeleting} />
              </Grid>
            ))}
          </Grid>
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} />
            </Box>
          )}
        </>
      )}

      {(data?.notes.length ?? 0) > 0 && (
        <Fab
          color="primary"
          aria-label={t('tastings.create')}
          onClick={() => setFormOpen(true)}
          sx={{ position: 'fixed', bottom: { xs: 80, md: 24 }, right: 24 }}
        >
          <AddIcon />
        </Fab>
      )}

      <TastingForm open={formOpen} onClose={() => setFormOpen(false)} />

      <TastingForm
        open={!!editing}
        onClose={() => setEditing(null)}
        editNote={editValues}
      />

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('tastings.deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('tastings.deleteConfirm')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>{t('actions.cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteMutation.isPending}>
            {t('actions.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
