'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Button, Collapse, Divider, FormControl, Grid,
  InputLabel, MenuItem, Paper, Select,
  TextField, Tooltip, Typography, Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SaveIcon from '@mui/icons-material/Save';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { Bottle, BottleCategory } from '@/lib/bottles/types';
import { CategoryFields, OptionalFields } from './CategoryFields';
import { maturityReferenceClient } from '@/lib/maturity-references/client';
import { MaturitySuggestion } from '@/lib/maturity-references/types';

interface BottleFormProps {
  initialValues?: Partial<Bottle>;
  onSubmit: (values: Partial<Bottle>) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
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

import { useCellars } from '@/hooks/useCellars';

/**
 * Formulaire 2 temps :
 * 1) Tronc commun (catégorie + nom + producteur + cave) → sauvegarde possible dès ici
 * 2) Champs essentiels par catégorie + section optionnelle repliable
 */
export function BottleForm({ initialValues, onSubmit, onCancel, isSubmitting = false, t }: BottleFormProps) {
  const { data: cellars } = useCellars();
  const [values, setValues] = useState<Partial<Bottle>>(initialValues ?? EMPTY_FORM);
  const [showOptionals, setShowOptionals] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [suggestion, setSuggestion] = useState<MaturitySuggestion | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const relevantCategory = values.category;
  const relevantForSuggest = ['wine', 'sparkling', 'spirit'].includes(relevantCategory ?? '');

  const setField = (field: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!relevantForSuggest || !values.category) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await maturityReferenceClient.suggest({
          category: values.category as 'wine' | 'sparkling' | 'spirit' | 'cigar',
          region: values.region ?? undefined,
          color: values.color ?? undefined,
          producer: values.producer ?? undefined,
          vintage: values.vintage ?? undefined,
        });
        setSuggestion(result);
      } catch {
        setSuggestion(null);
      }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.category, values.region, values.color, values.producer, values.vintage, relevantForSuggest]);

  const applySuggestion = () => {
    if (!suggestion) return;
    setValues((prev) => ({
      ...prev,
      peakMaturityFrom: suggestion.peakMaturityFrom ?? prev.peakMaturityFrom,
      peakMaturityTo: suggestion.peakMaturityTo ?? prev.peakMaturityTo,
    }));
    setShowOptionals(true);
    setSuggestion(null);
  };

  const canSaveMinimal = Boolean(
    values.category &&
    values.name?.trim() &&
    values.producer?.trim()
  );
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
      aria-label={isEditing ? t('bottle.edit') : t('bottle.add')}
    >
      <Typography variant="h6" fontWeight={700} gutterBottom>
        {isEditing ? t('bottle.edit') : t('bottle.add')}
      </Typography>

      {/* ── Step 1: Common trunk ── */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('bottle.step1')}
      </Typography>

      <Grid container spacing={2}>
        {/* Category */}
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth size="small" required>
            <InputLabel>{t('bottle.fields.category')}</InputLabel>
            <Select
              value={values.category ?? 'wine'}
              label={t('bottle.fields.category')}
              onChange={(e) => {
                setField('category', e.target.value as BottleCategory);
                setStep(2);
              }}
            >
              {(['wine', 'sparkling', 'spirit'] as BottleCategory[]).map((c) => (
                <MenuItem key={c} value={c}>{t(`categories.${c}`)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth size="small">
            <InputLabel>{t('nav.caves')}</InputLabel>
            <Select
              value={values.cellarId === null ? 'none' : (values.cellarId ?? 'none')}
              label={t('nav.caves')}
              onChange={(e) => setField('cellarId', e.target.value === 'none' ? null : e.target.value)}
            >
              <MenuItem value="none">
                <em>{t('bottle.noCellar')}</em>
              </MenuItem>
              {cellars?.map((cellar) => (
                <MenuItem key={cellar.id} value={cellar.id}>
                  {cellar.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Name */}
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            required
            size="small"
            label={t('bottle.fields.name')}
            value={values.name ?? ''}
            onChange={(e) => {
              setField('name', e.target.value);
              if (e.target.value && step === 1) setStep(2);
            }}
          />
        </Grid>

        {/* Producer */}
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            required
            size="small"
            label={t('bottle.fields.producer')}
            placeholder={t(`bottle.fields.producerPlaceholder.${values.category ?? 'wine'}`)}
            value={values.producer ?? ''}
            onChange={(e) => setField('producer', e.target.value)}
          />
        </Grid>
      </Grid>

      {/* Minimal save hint */}
      {canSaveMinimal && step === 1 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {t('bottle.saveMinimalHint')}
          </Typography>
        </Box>
      )}

      {/* ── Step 2: Category-specific essential fields ── */}
      {(step === 2 || isEditing) && values.category && (
        <>
          <Divider sx={{ my: 2.5 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('bottle.step2')}
          </Typography>

          <CategoryFields
            category={values.category}
            values={values as Record<string, unknown>}
            onChange={setField}
            t={t}
          />

          {/* Maturity suggestion banner */}
          {suggestion && suggestion.peakMaturityFrom != null && suggestion.peakMaturityTo != null && (
            <Alert
              severity="info"
              icon={<AutoAwesomeIcon fontSize="small" />}
              sx={{ mt: 2 }}
              action={
                <Button size="small" onClick={applySuggestion} color="inherit">
                  {t('bottle.maturitySuggestion.apply')}
                </Button>
              }
            >
              <strong>{suggestion.reference.name}</strong>
              {' — '}
              {t('bottle.maturitySuggestion.window', {
                from: suggestion.peakMaturityFrom,
                to: suggestion.peakMaturityTo,
              })}
            </Alert>
          )}

          {/* Optional fields toggle */}
          <Box sx={{ mt: 2 }}>
            <Tooltip title={showOptionals ? t('actions.showLess') : t('actions.showMore')}>
              <Button
                size="small"
                variant="text"
                onClick={() => setShowOptionals((prev) => !prev)}
                startIcon={showOptionals ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                aria-expanded={showOptionals}
                aria-controls="optional-fields"
              >
                {showOptionals ? t('actions.showLess') : t('actions.showMore')}
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
          {t('actions.cancel')}
        </Button>
        <Button
          type="submit"
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!canSaveMinimal || isSubmitting}
          aria-label={isEditing ? t('actions.update') : t('bottle.saveMinimal')}
        >
          {isSubmitting
            ? t('status.saving')
            : isEditing
              ? t('actions.update')
              : t('bottle.saveMinimal')}
        </Button>
      </Box>
    </Paper>
  );
}
