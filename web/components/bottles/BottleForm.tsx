'use client';
import React, { useState } from 'react';
import {
  Box, Button, Collapse, Divider, FormControl, Grid,
  InputLabel, MenuItem, Paper, Select,
  TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SaveIcon from '@mui/icons-material/Save';
import { Bottle, BottleCategory } from '@/lib/bottles/types';
import { CategoryFields, OptionalFields } from './CategoryFields';

interface BottleFormProps {
  initialValues?: Partial<Bottle>;
  onSubmit: (values: Partial<Bottle>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  t: (key: string) => string;
}

const EMPTY_FORM: Partial<Bottle> = {
  category: 'wine',
  name: '',
  producer: '',
  tags: [],
  grapeVarieties: [],
  isOpened: false,
  alertStatus: 'none',
};

/**
 * Formulaire 2 temps :
 * 1) Tronc commun (catégorie + nom + producteur) → sauvegarde possible dès ici
 * 2) Champs essentiels par catégorie + section optionnelle repliable
 */
export function BottleForm({ initialValues, onSubmit, onCancel, isSubmitting = false, t }: BottleFormProps) {
  const [values, setValues] = useState<Partial<Bottle>>(initialValues ?? EMPTY_FORM);
  const [showOptionals, setShowOptionals] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const setField = (field: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const canSaveMinimal = Boolean(values.category && values.name?.trim() && values.producer?.trim());
  const isEditing = Boolean(initialValues?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSaveMinimal) onSubmit(values);
  };

  return (
    <Paper
      component="form"
      onSubmit={handleSubmit}
      sx={{ p: 3 }}
      aria-label={isEditing ? t('common.bottle.edit') : t('common.bottle.add')}
    >
      <Typography variant="h6" fontWeight={700} gutterBottom>
        {isEditing ? t('common.bottle.edit') : t('common.bottle.add')}
      </Typography>

      {/* ── Step 1: Common trunk ── */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('common.bottle.step1')}
      </Typography>

      <Grid container spacing={2}>
        {/* Category */}
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth size="small" required>
            <InputLabel>{t('common.bottle.fields.category')}</InputLabel>
            <Select
              value={values.category ?? 'wine'}
              label={t('common.bottle.fields.category')}
              onChange={(e) => {
                setField('category', e.target.value as BottleCategory);
                setStep(2);
              }}
            >
              {(['wine', 'sparkling', 'spirit', 'cigar'] as BottleCategory[]).map((c) => (
                <MenuItem key={c} value={c}>{t(`common.categories.${c}`)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Name */}
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            required
            label={t('common.bottle.fields.name')}
            value={values.name ?? ''}
            onChange={(e) => {
              setField('name', e.target.value);
              if (e.target.value && step === 1) setStep(2);
            }}
          />
        </Grid>

        {/* Producer */}
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            required
            label={t('common.bottle.fields.producer')}
            value={values.producer ?? ''}
            onChange={(e) => setField('producer', e.target.value)}
          />
        </Grid>
      </Grid>

      {/* Minimal save hint */}
      {canSaveMinimal && step === 1 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {t('common.bottle.saveMinimalHint')}
          </Typography>
        </Box>
      )}

      {/* ── Step 2: Category-specific essential fields ── */}
      {(step === 2 || isEditing) && values.category && (
        <>
          <Divider sx={{ my: 2.5 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('common.bottle.step2')}
          </Typography>

          <CategoryFields
            category={values.category}
            values={values as Record<string, unknown>}
            onChange={setField}
            t={t}
          />

          {/* Optional fields toggle */}
          <Box sx={{ mt: 2 }}>
            <Tooltip title={showOptionals ? t('common.actions.showLess') : t('common.actions.showMore')}>
              <Button
                size="small"
                variant="text"
                onClick={() => setShowOptionals((prev) => !prev)}
                startIcon={showOptionals ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                aria-expanded={showOptionals}
                aria-controls="optional-fields"
              >
                {showOptionals ? t('common.actions.showLess') : t('common.actions.showMore')}
              </Button>
            </Tooltip>
          </Box>

          <Collapse in={showOptionals}>
            <Box id="optional-fields" sx={{ mt: 2 }}>
              <OptionalFields
                category={values.category}
                values={values as Record<string, unknown>}
                onChange={setField}
                t={t}
              />
            </Box>
          </Collapse>
        </>
      )}

      {/* ── Actions ── */}
      <Box sx={{ mt: 3, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={onCancel} disabled={isSubmitting}>
          {t('common.actions.cancel')}
        </Button>
        <Button
          type="submit"
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!canSaveMinimal || isSubmitting}
          aria-label={isEditing ? t('common.actions.update') : t('common.bottle.saveMinimal')}
        >
          {isSubmitting
            ? t('common.status.saving')
            : isEditing
            ? t('common.actions.update')
            : t('common.bottle.saveMinimal')}
        </Button>
      </Box>
    </Paper>
  );
}
