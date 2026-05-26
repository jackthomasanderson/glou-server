'use client';
import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Rating, MenuItem, Select,
  FormControl, InputLabel, Autocomplete,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { TastingFormValues } from '@/lib/tastings/types';
import { useCreateTasting, useUpdateTasting } from '@/hooks/useTastings';
import { useInventory } from '@/hooks/useInventory';
import { ServiceRecommendations } from './ServiceRecommendations';
import { useTranslation } from 'react-i18next';
import { InventoryItem } from '@/lib/inventory/types';

const CONTEXTS = ['solo', 'amis', 'restaurant', 'dégustation', 'cadeau'];

interface TastingFormProps {
  open: boolean;
  onClose: () => void;
  initialItemId?: string;
  editNote?: { id: string; values: TastingFormValues };
}

export function TastingForm({ open, onClose, initialItemId, editNote }: TastingFormProps) {
  const { t } = useTranslation();
  const { data: items } = useInventory();
  const createMutation = useCreateTasting();
  const updateMutation = useUpdateTasting();
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const { control, handleSubmit, reset, watch, setValue } = useForm<TastingFormValues>({
    defaultValues: { itemId: initialItemId, rating: null, notes: '', context: '', foodPairing: '', tastedAt: new Date().toISOString().split('T')[0] },
  });

  const watchedItemId = watch('itemId');

  useEffect(() => {
    if (open) {
      if (editNote) {
        reset(editNote.values);
      } else {
        reset({ itemId: initialItemId, rating: null, notes: '', context: '', foodPairing: '', tastedAt: new Date().toISOString().split('T')[0] });
      }
    }
  }, [open, initialItemId, editNote, reset]);

  useEffect(() => {
    if (watchedItemId && items) {
      const found = items.find((i) => i.id === watchedItemId) ?? null;
      setSelectedItem(found);
    } else {
      setSelectedItem(null);
    }
  }, [watchedItemId, items]);

  const handleClose = () => {
    if (!createMutation.isPending && !updateMutation.isPending) onClose();
  };

  const onSubmit = async (values: TastingFormValues) => {
    if (editNote) {
      await updateMutation.mutateAsync({ id: editNote.id, data: values });
    } else {
      await createMutation.mutateAsync(values);
    }
    onClose();
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const inventoryOptions = items?.filter((i) => !i.deletedAt) ?? [];

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>
          {editNote ? t('tastings.edit') : t('tastings.create')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Controller
              name="itemId"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={inventoryOptions}
                  getOptionLabel={(opt) => `${opt.name} — ${opt.producer}${opt.vintage ? ` (${opt.vintage})` : ''}`}
                  value={inventoryOptions.find((i) => i.id === field.value) ?? null}
                  onChange={(_, val) => field.onChange(val?.id ?? '')}
                  renderInput={(params) => (
                    <TextField {...params} label={t('tastings.fields.item')} />
                  )}
                  disabled={!!initialItemId}
                />
              )}
            />

            {selectedItem && <ServiceRecommendations item={selectedItem} />}

            <Controller
              name="tastedAt"
              control={control}
              render={({ field }) => (
                <TextField {...field} label={t('tastings.fields.tastedAt')} type="date" InputLabelProps={{ shrink: true }} />
              )}
            />

            <Box>
              <Typography variant="caption" color="text.secondary">{t('tastings.fields.rating')}</Typography>
              <Controller
                name="rating"
                control={control}
                render={({ field }) => (
                  <Rating
                    value={field.value ?? 0}
                    onChange={(_, val) => field.onChange(val)}
                    size="large"
                  />
                )}
              />
            </Box>

            <Controller
              name="context"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>{t('tastings.fields.context')}</InputLabel>
                  <Select {...field} label={t('tastings.fields.context')}>
                    <MenuItem value=""><em>{t('actions.none')}</em></MenuItem>
                    {CONTEXTS.map((c) => (
                      <MenuItem key={c} value={c}>{c}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField {...field} label={t('tastings.fields.notes')} multiline rows={4} />
              )}
            />

            <Controller
              name="foodPairing"
              control={control}
              render={({ field }) => (
                <TextField {...field} label={t('tastings.fields.foodPairing')} />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={isLoading}>{t('actions.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? t('actions.saving') : t('actions.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
