'use client';
import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Checkbox, FormControlLabel,
  Stack, TextField, MenuItem, Divider, IconButton,
  Select, InputLabel, FormControl, Chip, Alert,
  Autocomplete,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { Bottle } from '@/lib/bottles/types';
import { useCellars } from '@/hooks/useCellars';
import { useBulkPresets, useCreateBulkPreset, useDeleteBulkPreset } from '@/hooks/useBulkPresets';

interface BulkActionDialogProps {
  open: boolean;
  onClose: () => void;
  selectedBottles: Bottle[];
  onApply: (patch: Partial<Bottle>) => void;
  isSubmitting?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * BulkActionDialog allows updating multiple bottles at once.
 * Supports: Cellar, Location, Collection, Tags, Consumption status (isOpened).
 * Allows saving/loading presets.
 */
export function BulkActionDialog({
  open,
  onClose,
  selectedBottles,
  onApply,
  isSubmitting,
  t,
}: BulkActionDialogProps) {
  const { data: cellars } = useCellars();
  const { data: presets } = useBulkPresets();
  const createPresetMutation = useCreateBulkPreset();
  const deletePresetMutation = useDeleteBulkPreset();

  // State for enabled fields
  const [enabledFields, setEnabledFields] = useState({
    cellarId: false,
    location: false,
    collection: false,
    tags: false,
    isOpened: false,
  });

  // State for field values
  const [values, setValues] = useState<Partial<Bottle>>({
    cellarId: null,
    location: '',
    collection: '',
    tags: [],
    isOpened: false,
  });

  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  const toggleField = (field: keyof typeof enabledFields) => {
    setEnabledFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const setField = (field: string, value: any) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleApply = () => {
    const patch: Partial<Bottle> = {};
    if (enabledFields.cellarId) patch.cellarId = values.cellarId;
    if (enabledFields.location) patch.location = values.location;
    if (enabledFields.collection) patch.collection = values.collection;
    if (enabledFields.tags) patch.tags = values.tags;
    if (enabledFields.isOpened) patch.isOpened = values.isOpened;
    onApply(patch);
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const patch: Partial<Bottle> = {};
    if (enabledFields.cellarId) patch.cellarId = values.cellarId;
    if (enabledFields.location) patch.location = values.location;
    if (enabledFields.collection) patch.collection = values.collection;
    if (enabledFields.tags) patch.tags = values.tags;
    if (enabledFields.isOpened) patch.isOpened = values.isOpened;

    createPresetMutation.mutate({ name: presetName, payload: patch }, {
      onSuccess: () => {
        setPresetName('');
        setShowSavePreset(false);
      }
    });
  };

  const handleLoadPreset = (preset: any) => {
    const p = preset.payload;
    const newEnabled = { ...enabledFields };
    const newValues = { ...values };

    if (p.cellarId !== undefined) {
      newEnabled.cellarId = true;
      newValues.cellarId = p.cellarId;
    }
    if (p.location !== undefined) {
      newEnabled.location = true;
      newValues.location = p.location;
    }
    if (p.collection !== undefined) {
      newEnabled.collection = true;
      newValues.collection = p.collection;
    }
    if (p.tags !== undefined) {
      newEnabled.tags = true;
      newValues.tags = p.tags;
    }
    if (p.isOpened !== undefined) {
      newEnabled.isOpened = true;
      newValues.isOpened = p.isOpened;
    }

    setEnabledFields(newEnabled);
    setValues(newValues);
  };

  // Summary logic: Before vs After
  const summary = useMemo(() => {
    const fields = ['cellarId', 'location', 'collection', 'tags', 'isOpened'] as const;
    const result: Record<string, { before: string; after: string; changed: boolean }> = {};

    fields.forEach((field) => {
      const isEnabled = enabledFields[field];
      if (!isEnabled) {
        result[field] = { before: '', after: '', changed: false };
        return;
      }

      // Calculate Before
      let beforeText = '';
      const uniqueValues = new Set(selectedBottles.map(b => {
          const val = (b as any)[field];
          if (field === 'tags') return JSON.stringify(val?.sort() || []);
          return val;
      }));

      if (uniqueValues.size > 1) {
        beforeText = t('bulk.mixed');
      } else {
        const val = Array.from(uniqueValues)[0];
        if (field === 'cellarId') {
          beforeText = cellars?.find(c => c.id === val)?.name || t('bottle.noCellar');
        } else if (field === 'isOpened') {
          beforeText = val ? t('bottle.sealedStatus.opened') : t('bottle.sealedStatus.sealed');
        } else if (field === 'tags') {
          beforeText = (JSON.parse(val as string) as string[]).join(', ') || t('status.empty');
        } else {
          beforeText = (val as string) || t('status.empty');
        }
      }

      // Calculate After
      let afterText = '';
      const afterVal = (values as any)[field];
      if (field === 'cellarId') {
        afterText = cellars?.find(c => c.id === afterVal)?.name || t('bottle.noCellar');
      } else if (field === 'isOpened') {
        afterText = afterVal ? t('bottle.sealedStatus.opened') : t('bottle.sealedStatus.sealed');
      } else if (field === 'tags') {
        afterText = (afterVal as string[]).join(', ') || t('status.empty');
      } else {
        afterText = (afterVal as string) || t('status.empty');
      }

      result[field] = { before: beforeText, after: afterText, changed: true };
    });

    return result;
  }, [selectedBottles, enabledFields, values, cellars, t]);

  const hasChanges = Object.values(enabledFields).some(v => v);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle fontWeight="bold">
        {t('bulk.title')}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
          {t('bulk.subtitle', { count: selectedBottles.length })}
        </Typography>

        {/* Presets Toggle */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" color="primary">
              {t('bulk.presets')}
            </Typography>
            {presets && presets.length > 0 && (
              <Select
                size="small"
                displayEmpty
                value=""
                onChange={(e) => {
                  const p = presets.find(pr => pr.id === e.target.value);
                  if (p) handleLoadPreset(p);
                }}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="" disabled>{t('bulk.loadPreset')}</MenuItem>
                {presets.map(p => (
                  <MenuItem key={p.id} value={p.id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    {p.name}
                    <IconButton size="small" onClick={(e) => {
                      e.stopPropagation();
                      deletePresetMutation.mutate(p.id);
                    }} sx={{ ml: 1 }}>
                      <DeleteIcon fontSize="inherit" />
                    </IconButton>
                  </MenuItem>
                ))}
              </Select>
            )}
          </Stack>
        </Box>

        <Divider sx={{ mb: 3 }} />

        <Typography variant="subtitle2" gutterBottom>
          {t('bulk.fieldsToUpdate')}
        </Typography>

        <Stack spacing={2} sx={{ mb: 4 }}>
          {/* Cellar */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={enabledFields.cellarId} onChange={() => toggleField('cellarId')} />}
              label={t('nav.caves')}
            />
            {enabledFields.cellarId && (
              <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                <InputLabel>{t('nav.caves')}</InputLabel>
                <Select
                  value={values.cellarId || 'none'}
                  label={t('nav.caves')}
                  onChange={(e) => setField('cellarId', e.target.value === 'none' ? null : e.target.value)}
                >
                  <MenuItem value="none"><em>{t('bottle.noCellar')}</em></MenuItem>
                  {cellars?.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </Box>

          {/* Location */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={enabledFields.location} onChange={() => toggleField('location')} />}
              label={t('bottle.fields.location')}
            />
            {enabledFields.location && (
              <TextField
                fullWidth size="small" sx={{ mt: 1 }}
                label={t('bottle.fields.location')}
                value={values.location}
                onChange={(e) => setField('location', e.target.value)}
              />
            )}
          </Box>

          {/* Collection */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={enabledFields.collection} onChange={() => toggleField('collection')} />}
              label={t('bottle.fields.collection')}
            />
            {enabledFields.collection && (
              <TextField
                fullWidth size="small" sx={{ mt: 1 }}
                label={t('bottle.fields.collection')}
                value={values.collection}
                onChange={(e) => setField('collection', e.target.value)}
              />
            )}
          </Box>

          {/* Tags */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={enabledFields.tags} onChange={() => toggleField('tags')} />}
              label={t('bottle.fields.tags')}
            />
            {enabledFields.tags && (
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={values.tags || []}
                onChange={(_, newValue) => setField('tags', newValue)}
                renderTags={(value: string[], getTagProps) =>
                  value.map((option: string, index: number) => (
                    <Chip variant="outlined" label={option} {...getTagProps({ index })} key={index} />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} size="small" sx={{ mt: 1 }} label={t('bottle.fields.tags')} placeholder="..." />
                )}
              />
            )}
          </Box>

          {/* isOpened */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={enabledFields.isOpened} onChange={() => toggleField('isOpened')} />}
              label={t('bottle.fields.isOpened')}
            />
            {enabledFields.isOpened && (
              <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                <InputLabel>{t('bottle.fields.isOpened')}</InputLabel>
                <Select
                  value={values.isOpened ? 'opened' : 'sealed'}
                  label={t('bottle.fields.isOpened')}
                  onChange={(e) => setField('isOpened', e.target.value === 'opened')}
                >
                  <MenuItem value="sealed">{t('bottle.sealedStatus.sealed')}</MenuItem>
                  <MenuItem value="opened">{t('bottle.sealedStatus.opened')}</MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>
        </Stack>

        {/* Preview Section */}
        {hasChanges && (
          <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              {t('bulk.preview')}
            </Typography>
            <Stack spacing={1}>
              {Object.entries(summary).map(([field, data]) => {
                if (!data.changed) return null;
                return (
                  <Box key={field} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ minWidth: 80, fontWeight: 'bold' }}>
                      {field === 'cellarId' ? t('nav.caves') : t(`bottle.fields.${field}`)} :
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                      {data.before}
                    </Typography>
                    <Typography variant="caption" color="primary" fontWeight="bold">
                      → {data.after}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}

        {/* Save Preset Section */}
        {hasChanges && (
          <Box sx={{ mt: 3 }}>
            {!showSavePreset ? (
              <Button size="small" startIcon={<SaveIcon />} onClick={() => setShowSavePreset(true)}>
                {t('bulk.savePreset')}
              </Button>
            ) : (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small"
                  label={t('bulk.presetName')}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  sx={{ flexGrow: 1 }}
                />
                <Button variant="contained" size="small" onClick={handleSavePreset} disabled={!presetName.trim()}>
                  {t('actions.save')}
                </Button>
                <Button size="small" onClick={() => setShowSavePreset(false)}>
                  {t('actions.cancel')}
                </Button>
              </Stack>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit">{t('actions.cancel')}</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleApply}
          disabled={!hasChanges || isSubmitting}
        >
          {isSubmitting ? t('status.saving') : t('bulk.apply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
