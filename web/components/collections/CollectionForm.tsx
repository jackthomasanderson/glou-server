'use client';
import React, { useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Tooltip,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { CollectionFormValues, Collection } from '@/lib/collections/types';
import { useTranslation } from 'react-i18next';

const PRESET_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

const PRESET_ICONS = ['📦', '⭐', '🎁', '🍷', '🥃', '🌿', '🏆', '💎'];

interface CollectionFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: CollectionFormValues) => Promise<void>;
  initial?: Partial<Collection>;
  isLoading?: boolean;
}

export function CollectionForm({ open, onClose, onSubmit, initial, isLoading }: CollectionFormProps) {
  const { t } = useTranslation();
  const { control, handleSubmit, reset, watch, setValue } = useForm<CollectionFormValues>({
    defaultValues: { name: '', color: '#6366f1', icon: '' },
  });

  const selectedColor = watch('color');
  const selectedIcon = watch('icon');

  useEffect(() => {
    if (open) {
      reset({
        name: initial?.name ?? '',
        color: initial?.color ?? '#6366f1',
        icon: initial?.icon ?? '',
      });
    }
  }, [open, initial, reset]);

  const handleClose = () => {
    if (!isLoading) onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>
          {initial?.id ? t('collections.edit') : t('collections.create')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Controller
              name="name"
              control={control}
              rules={{ required: true, minLength: 1, maxLength: 100 }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label={t('collections.fields.name')}
                  fullWidth
                  autoFocus
                  error={!!fieldState.error}
                  helperText={fieldState.error ? t('collections.errors.nameRequired') : ''}
                />
              )}
            />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                {t('collections.fields.color')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map((color) => (
                  <Tooltip key={color} title={color}>
                    <Box
                      onClick={() => setValue('color', color)}
                      sx={{
                        width: 28, height: 28, borderRadius: '50%', bgcolor: color,
                        cursor: 'pointer',
                        border: selectedColor === color ? '3px solid' : '2px solid transparent',
                        borderColor: selectedColor === color ? 'text.primary' : 'transparent',
                        transition: 'border-color 0.15s',
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                {t('collections.fields.icon')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {PRESET_ICONS.map((icon) => (
                  <Box
                    key={icon}
                    onClick={() => setValue('icon', selectedIcon === icon ? '' : icon)}
                    sx={{
                      width: 36, height: 36, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '1.2rem', borderRadius: 1,
                      cursor: 'pointer',
                      bgcolor: selectedIcon === icon ? 'action.selected' : 'action.hover',
                      border: selectedIcon === icon ? '2px solid' : '2px solid transparent',
                      borderColor: selectedIcon === icon ? 'primary.main' : 'transparent',
                    }}
                  >
                    {icon}
                  </Box>
                ))}
              </Box>
            </Box>
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
