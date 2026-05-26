'use client';
import React, { useState } from 'react';
import {
  Box, Container, Typography, Grid, Fab, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import { useCollections, useCreateCollection, useUpdateCollection, useDeleteCollection } from '@/hooks/useCollections';
import { Collection, CollectionFormValues } from '@/lib/collections/types';
import { CollectionCard } from './CollectionCard';
import { CollectionForm } from './CollectionForm';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';

export function CollectionsDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: collections, isLoading, isError } = useCollections();
  const createMutation = useCreateCollection();
  const updateMutation = useUpdateCollection();
  const deleteMutation = useDeleteCollection();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);

  const handleCreate = async (values: CollectionFormValues) => {
    await createMutation.mutateAsync(values);
    setFormOpen(false);
  };

  const handleUpdate = async (values: CollectionFormValues) => {
    if (!editing) return;
    await updateMutation.mutateAsync({ id: editing.id, data: values });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    setDeleting(null);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <CollectionsBookmarkIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>{t('collections.title')}</Typography>
      </Box>

      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('collections.errors.load')}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !collections?.length ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CollectionsBookmarkIcon sx={{ fontSize: 64, color: 'action.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">{t('collections.empty')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('collections.emptyHint')}
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
            {t('collections.create')}
          </Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {collections.map((col) => (
            <Grid item key={col.id} xs={12} sm={6} md={4} lg={3}>
              <CollectionCard
                collection={col}
                onEdit={setEditing}
                onDelete={setDeleting}
                onClick={() => router.push(`/inventory?collection=${col.id}`)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {(collections?.length ?? 0) > 0 && (
        <Fab
          color="primary"
          aria-label={t('collections.create')}
          onClick={() => setFormOpen(true)}
          sx={{ position: 'fixed', bottom: { xs: 80, md: 24 }, right: 24 }}
        >
          <AddIcon />
        </Fab>
      )}

      <CollectionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
        isLoading={createMutation.isPending}
      />

      <CollectionForm
        open={!!editing}
        onClose={() => setEditing(null)}
        onSubmit={handleUpdate}
        initial={editing ?? undefined}
        isLoading={updateMutation.isPending}
      />

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('collections.deleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('collections.deleteConfirm', { name: deleting?.name ?? '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>{t('actions.cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {t('actions.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
