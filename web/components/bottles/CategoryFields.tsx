'use client';
import React from 'react';
import {
  Grid, TextField, Select, MenuItem, FormControl, InputLabel,
  FormControlLabel, Checkbox, Slider, Typography, Box, Button,
} from '@mui/material';
import { BottleCategory } from '@/lib/bottles/types';

interface CategoryFieldsProps {
  category: BottleCategory;
  values: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * Champs essentiels affichés directement après sélection de catégorie.
 * Aucun champ essentiel n'est masqué (critère d'acceptation #2).
 */
export function CategoryFields({ category, values, onChange, t }: CategoryFieldsProps) {
  const field = (name: string, label: string, type: 'text' | 'number' = 'text', required = false) => (
    <Grid item xs={12} sm={6} key={name}>
      <TextField
        fullWidth
        required={required}
        label={label}
        type={type}
        value={String(values[name] ?? '')}
        onChange={(e) => onChange(name, type === 'number' ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value)}
        inputProps={type === 'number' ? { min: 0, step: type === 'number' ? 1 : undefined } : undefined}
      />
    </Grid>
  );

  const vintageField = (
    <Grid item xs={12} sm={6} key="vintage">
      <TextField
        fullWidth
        label={t('bottle.fields.vintage')}
        type="number"
        value={String(values['vintage'] ?? '')}
        onChange={(e) => onChange('vintage', e.target.value ? Number(e.target.value) : undefined)}
        inputProps={{ min: 1800, max: 2100, step: 1 }}
        helperText={t('bottle.fields.noVintage')}
      />
    </Grid>
  );

  switch (category) {
    case 'wine':
      return (
        <Grid container spacing={2}>
          {vintageField}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('bottle.fields.color')}</InputLabel>
              <Select
                value={String(values['color'] ?? '')}
                label={t('bottle.fields.color')}
                onChange={(e) => onChange('color', e.target.value)}
              >
                {['red', 'white', 'rosé', 'orange'].map((c) => (
                  <MenuItem key={c} value={c}>{t(`bottle.color.${c}`)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {field('region', t('bottle.fields.region'))}
          {field('alcoholDegree', t('bottle.fields.alcoholDegree'), 'number')}
        </Grid>
      );

    case 'sparkling':
      return (
        <Grid container spacing={2}>
          {vintageField}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('bottle.fields.sparklingType')}</InputLabel>
              <Select
                value={String(values['sparklingType'] ?? '')}
                label={t('bottle.fields.sparklingType')}
                onChange={(e) => onChange('sparklingType', e.target.value)}
              >
                {[
                  { key: 'champagne', label: 'Champagne' },
                  { key: 'cremant', label: 'Crémant' },
                  { key: 'prosecco', label: 'Prosecco' },
                  { key: 'cava', label: 'Cava' },
                  { key: 'petnat', label: 'Pétillant Naturel' },
                  { key: 'other', label: 'Autre' }
                ].map((s) => (
                  <MenuItem key={s.key} value={s.key}>{t(`bottle.sparklingTypes.${s.key}`)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {field('sugarLevel', t('bottle.fields.sugarLevel'))}
        </Grid>
      );

    case 'spirit':
      return (
        <Grid container spacing={2}>
          {field('edition', t('bottle.fields.edition'))}
          {field('alcoholDegree', t('bottle.fields.alcoholDegree'), 'number', true)}
        </Grid>
      );

    case 'cigar':
      return (
        <Grid container spacing={2}>
          {field('format', t('bottle.fields.format'))}
          {field('quantity', t('bottle.fields.quantity'), 'number', true)}
        </Grid>
      );

    default:
      return null;
  }
}

// ─── Optional section ────────────────────────────────────────────────────────

interface OptionalFieldsProps {
  category: BottleCategory;
  values: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * Champs optionnels regroupés dans une section repliable.
 * Visible uniquement si l'utilisateur clique "Afficher les compléments".
 */
export function OptionalFields({ category, values, onChange, t }: OptionalFieldsProps) {
  const field = (name: string, label: string, type: 'text' | 'number' = 'text') => (
    <Grid item xs={12} sm={6} key={name}>
      <TextField
        fullWidth
        label={label}
        type={type}
        value={String(values[name] ?? '')}
        onChange={(e) => onChange(name, type === 'number' ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value)}
      />
    </Grid>
  );

  const commonOptionals = (
    <>
      {field('location', t('bottle.fields.location'))}
      {field('collection', t('bottle.fields.collection'))}
      {field('purchasePrice', t('bottle.fields.purchasePrice'), 'number')}
      {field('estimatedValue', t('bottle.fields.estimatedValue'), 'number')}
      {field('photoUrl', t('bottle.fields.photoUrl'))}
      <Grid item xs={12} key="notes">
        <TextField
          fullWidth
          multiline
          rows={3}
          label={t('bottle.fields.notes')}
          value={String(values['notes'] ?? '')}
          onChange={(e) => onChange('notes', e.target.value)}
        />
      </Grid>
      <Grid item xs={12} sm={6} key="isOpened">
        <FormControlLabel
          control={
            <Checkbox
              checked={Boolean(values['isOpened'])}
              onChange={(e) => {
                onChange('isOpened', e.target.checked);
                if (e.target.checked && !values['openedAt']) {
                  onChange('openedAt', new Date().toISOString().split('T')[0]);
                }
              }}
            />
          }
          label={t('bottle.fields.isOpened')}
        />
      </Grid>
      {Boolean(values['isOpened']) && (
        <>
          <Grid item xs={12} key="fillLevel">
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('bottle.fields.fillLevel')}
            </Typography>
            <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {[
                { val: 100, label: t('bottle.fillLevels.full') },
                { val: 75, label: t('bottle.fillLevels.threeQuarters') },
                { val: 50, label: t('bottle.fillLevels.half') },
                { val: 25, label: t('bottle.fillLevels.quarter') },
                { val: 0, label: t('bottle.fillLevels.empty') },
              ].map((level) => (
                <Button
                  key={level.val}
                  size="small"
                  variant={values['fillLevel'] === level.val ? 'contained' : 'outlined'}
                  onClick={() => onChange('fillLevel', level.val)}
                  sx={{ borderRadius: 2 }}
                >
                  {level.label}
                </Button>
              ))}
            </Box>
            <Slider
              value={Number(values['fillLevel'] ?? 100)}
              min={0}
              max={100}
              step={5}
              marks
              valueLabelDisplay="auto"
              onChange={(_e, v) => onChange('fillLevel', v)}
              aria-label={t('bottle.fields.fillLevel')}
            />
          </Grid>
          <Grid item xs={12} sm={6} key="openedAt">
            <TextField
              fullWidth
              type="date"
              label={t('bottle.fields.openedAt')}
              InputLabelProps={{ shrink: true }}
              value={typeof values['openedAt'] === 'string' ? values['openedAt'].split('T')[0] : ''}
              onChange={(e) => onChange('openedAt', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} key="reminderDate">
            <TextField
              fullWidth
              type="date"
              label={t('bottle.fields.reminderDate')}
              InputLabelProps={{ shrink: true }}
              value={typeof values['reminderDate'] === 'string' ? values['reminderDate'].split('T')[0] : ''}
              onChange={(e) => onChange('reminderDate', e.target.value)}
              helperText="Rappel optionnel pour consommer avant oxydation"
            />
          </Grid>
        </>
      )}
    </>
  );

  const peakWindowFields = (
    <>
      <Grid item xs={12} sm={6} key="peakMaturityFrom">
        <TextField
          fullWidth
          label={t('bottle.fields.peakMaturityFrom')}
          type="number"
          value={String(values['peakMaturityFrom'] ?? '')}
          onChange={(e) => onChange('peakMaturityFrom', e.target.value ? Number(e.target.value) : null)}
          inputProps={{ min: 1800, max: 2200, step: 1 }}
          helperText={t('bottle.fields.peakMaturityFromHint')}
        />
      </Grid>
      <Grid item xs={12} sm={6} key="peakMaturityTo">
        <TextField
          fullWidth
          label={t('bottle.fields.peakMaturityTo')}
          type="number"
          value={String(values['peakMaturityTo'] ?? '')}
          onChange={(e) => onChange('peakMaturityTo', e.target.value ? Number(e.target.value) : null)}
          inputProps={{ min: 1800, max: 2200, step: 1 }}
          helperText={t('bottle.fields.peakMaturityToHint')}
        />
      </Grid>
    </>
  );

  const wineOptionals = (
    <>
      {field('bottleSize', t('bottle.fields.bottleSize'))}
      {field('peakMaturity', t('bottle.fields.peakMaturity'))}
      {peakWindowFields}
      {field('serviceTemp', t('bottle.fields.serviceTemp'))}
      {field('lotNumber', t('bottle.fields.lotNumber'))}
      <Grid item xs={12} sm={6} key="needsAeration">
        <FormControlLabel
          control={
            <Checkbox
              checked={Boolean(values['needsAeration'])}
              onChange={(e) => onChange('needsAeration', e.target.checked)}
            />
          }
          label={t('bottle.fields.needsAeration')}
        />
      </Grid>
    </>
  );

  const sparklingOptionals = (
    <>
      {field('bottleSize', t('bottle.fields.bottleSize'))}
      {field('peakMaturity', t('bottle.fields.peakMaturity'))}
      {peakWindowFields}
      {field('serviceTemp', t('bottle.fields.serviceTemp'))}
      {field('baseYear', t('bottle.fields.baseYear'), 'number')}
    </>
  );

  const spiritOptionals = (
    <>
      {field('declaredAge', t('bottle.fields.declaredAge'))}
      {field('caskType', t('bottle.fields.caskType'))}
      {field('aromaticProfile', t('bottle.fields.aromaticProfile'))}
      {field('additions', t('bottle.fields.additions'))}
      {field('lotNumber', t('bottle.fields.lotNumber'))}
      {field('bottleSize', t('bottle.fields.bottleSize'))}
    </>
  );

  const cigarOptionals = (
    <>
      {field('manufactureYear', t('bottle.fields.manufactureYear'), 'number')}
      {field('leafOrigin', t('bottle.fields.leafOrigin'))}
      {field('factoryCode', t('bottle.fields.factoryCode'))}
      {field('recommendedHumidity', t('bottle.fields.recommendedHumidity'), 'number')}
      {field('humidificationSystem', t('bottle.fields.humidificationSystem'))}
    </>
  );

  return (
    <Grid container spacing={2}>
      {commonOptionals}
      {category === 'wine' && wineOptionals}
      {category === 'sparkling' && sparklingOptionals}
      {category === 'spirit' && spiritOptionals}
      {category === 'cigar' && cigarOptionals}
    </Grid>
  );
}
