'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Alert, Box, Button, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid,
  IconButton, InputLabel, MenuItem, Select, Stack, TextField,
  Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import WineBarIcon from '@mui/icons-material/WineBar';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { useCellars } from '@/hooks/useCellars';
import { maturityReferenceClient } from '@/lib/maturity-references/client';
import { MaturitySuggestion } from '@/lib/maturity-references/types';
import { ProductAutocomplete } from './ProductAutocomplete';
import { ProductSuggestion } from '@/lib/inventory/productSearch';
import { ProducerAutocomplete } from './ProducerAutocomplete';
import { ImageResult } from './ImagePicker';
import { ItemImageSection } from './ItemImageSection';

interface InventoryFormProps {
  open: boolean;
  initialValues?: Partial<InventoryItem>;
  onSubmit: (values: Partial<InventoryItem>) => void;
  onClose: () => void;
  isSubmitting?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const EMPTY_FORM: Partial<InventoryItem> = {
  category: 'wine',
  name: '',
  producer: '',
  tags: [],
  grapeVarieties: [],
  isOpened: false,
  alertStatus: 'none',
};

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <WineBarIcon fontSize="small" />,
  sparkling: <BubbleChartIcon fontSize="small" />,
  spirit: <SportsMmaIcon fontSize="small" />,
  cigar: <GrassIcon fontSize="small" />,
};

const CATEGORY_COLORS: Record<InventoryCategory, 'secondary' | 'primary' | 'default' | 'warning'> = {
  wine: 'secondary',
  sparkling: 'primary',
  spirit: 'default',
  cigar: 'warning',
};

export function InventoryForm({
  open, initialValues, onSubmit, onClose, isSubmitting = false, t,
}: InventoryFormProps) {
  const { data: cellars } = useCellars();
  const [values, setValues] = useState<Partial<InventoryItem>>(initialValues ?? EMPTY_FORM);
  const [showOptionals, setShowOptionals] = useState(false);
  const [suggestion, setSuggestion] = useState<MaturitySuggestion | null>(null);
  const [prefetchedImages, setPrefetchedImages] = useState<ImageResult[]>([]);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditing = Boolean(initialValues?.id);

  // Reset form when dialog opens with new values
  useEffect(() => {
    if (open) {
      setValues(initialValues ?? EMPTY_FORM);
      setShowOptionals(false);
      setSuggestion(null);
      setPrefetchedImages([]);
      setIsAutoLoading(false);
    }
  }, [open, initialValues]);

  // Auto-search + auto-save first result when name + producer filled and no photo yet
  useEffect(() => {
    if (isEditing || !values.name?.trim() || !values.producer?.trim() || values.photoUrl) {
      return;
    }
    if (imageDebounceRef.current) clearTimeout(imageDebounceRef.current);
    imageDebounceRef.current = setTimeout(async () => {
      setIsAutoLoading(true);
      try {
        const q = encodeURIComponent(`${values.producer} ${values.name}`.trim());
        const searchRes = await fetch(`/api/search/images?q=${q}`, { credentials: 'include' });
        const searchJson = (await searchRes.json()) as { data: ImageResult[] };
        const results = searchJson.data ?? [];
        setPrefetchedImages(results);

        if (results.length > 0) {
          const saveRes = await fetch('/api/search/images/save', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: results[0].url }),
          });
          const saveJson = (await saveRes.json()) as { data?: { path: string } };
          if (saveJson.data?.path) {
            setField('photoUrl', saveJson.data.path);
          }
        }
      } catch { /* ignore */ } finally {
        setIsAutoLoading(false);
      }
    }, 1200);
    return () => { if (imageDebounceRef.current) clearTimeout(imageDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.name, values.producer, values.photoUrl, isEditing]);

  const setField = (field: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const canSave = Boolean(values.category && values.name?.trim() && values.producer?.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSubmit(values);
  };

  // Debounced maturity suggestion
  const hasPeakCategories = ['wine', 'sparkling'].includes(values.category ?? '');
  useEffect(() => {
    if (!hasPeakCategories || !values.category) { setSuggestion(null); return; }
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
      } catch { setSuggestion(null); }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.category, values.region, values.color, values.producer, values.vintage]);

  const applySuggestion = () => {
    if (!suggestion) return;
    setValues((prev) => ({
      ...prev,
      peakMaturityFrom: suggestion.peakMaturityFrom ?? prev.peakMaturityFrom,
      peakMaturityTo: suggestion.peakMaturityTo ?? prev.peakMaturityTo,
    }));
    setSuggestion(null);
  };

  const category = (values.category ?? 'wine') as InventoryCategory;
  const isWine = category === 'wine';
  const isSparkling = category === 'sparkling';
  const isSpirit = category === 'spirit';
  const isCigar = category === 'cigar';
  const isWineOrSparkling = isWine || isSparkling;

  const numField = (val: string, fallback?: number) => (val ? Number(val) : fallback);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      PaperProps={{ component: 'form', onSubmit: handleSubmit }}
    >
      <DialogTitle sx={{ pr: 6, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip
            icon={CATEGORY_ICONS[category]}
            label={t(`categories.${category}`)}
            color={CATEGORY_COLORS[category]}
            size="small"
          />
          <Typography variant="h6" component="span" fontWeight={600}>
            {isEditing ? t('inventory.edit') : t('inventory.add')}
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', top: 8, right: 8 }}
          disabled={isSubmitting}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, display: 'flex', alignItems: 'stretch' }}>
        {/* ── Left: image panel ─────────────────────────────────────── */}
        <Box
          sx={{
            width: 170,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            px: 2,
            py: 2.5,
            display: { xs: 'none', sm: 'block' },
          }}
        >
          <ItemImageSection
            photoUrl={values.photoUrl ?? ''}
            onPhotoChange={(url) => setField('photoUrl', url)}
            category={category}
            autoSearchQuery={[values.producer, values.name].filter(Boolean).join(' ')}
            preloadedResults={prefetchedImages}
            isAutoLoading={isAutoLoading}
          />
        </Box>

        {/* ── Right: form fields ────────────────────────────────────── */}
        <Box sx={{ flex: 1, px: 3, py: 2.5, minWidth: 0, overflowY: 'auto' }}>
        <Stack spacing={3}>

          {/* ── Section 1 : Identité ──────────────────────────────────────── */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {t('inventory.step1')}
            </Typography>

            {/* Category chips */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              {(['wine', 'sparkling', 'spirit', 'cigar'] as InventoryCategory[]).map((cat) => (
                <Chip
                  key={cat}
                  icon={CATEGORY_ICONS[cat]}
                  label={t(`categories.${cat}`)}
                  color={category === cat ? CATEGORY_COLORS[cat] : 'default'}
                  variant={category === cat ? 'filled' : 'outlined'}
                  onClick={() => setField('category', cat)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Stack>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <ProductAutocomplete
                  value={values.name ?? ''}
                  onChange={(name) => setField('name', name)}
                  onSelect={(s: ProductSuggestion) =>
                    setValues((prev) => ({
                      ...prev,
                      name: s.name,
                      producer: s.producer ?? prev.producer,
                      category: (s.category as InventoryCategory) ?? prev.category,
                      vintage: s.vintage ?? prev.vintage,
                      bottleSize: s.bottleSize ?? prev.bottleSize,
                      format: s.format ?? prev.format,
                      region: s.region ?? prev.region,
                    }))
                  }
                  category={values.category ?? 'wine'}
                  disabled={isEditing}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <ProducerAutocomplete
                  value={values.producer ?? ''}
                  onChange={(producer) => setField('producer', producer)}
                  category={values.category ?? 'wine'}
                  label={t('inventory.fields.producer')}
                  placeholder={t(`inventory.fields.producerPlaceholder.${category}`)}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('nav.caves')}</InputLabel>
                  <Select
                    value={values.cellarId === null ? 'none' : (values.cellarId ?? 'none')}
                    label={t('nav.caves')}
                    onChange={(e) => setField('cellarId', e.target.value === 'none' ? null : e.target.value)}
                  >
                    <MenuItem value="none"><em>{t('inventory.noCellar')}</em></MenuItem>
                    {cellars?.map((c) => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>

          <Divider />

          {/* ── Section 2 : Caractéristiques catégorie ───────────────────── */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {t('inventory.step2')}
            </Typography>

            <Grid container spacing={2}>

              {/* Wine essential */}
              {isWine && (
                <>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.vintage')}
                      type="number"
                      value={values.vintage ?? ''}
                      onChange={(e) => setField('vintage', numField(e.target.value))}
                      inputProps={{ min: 1800, max: 2100, step: 1 }}
                      helperText={t('inventory.fields.noVintage')}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('inventory.fields.color')}</InputLabel>
                      <Select
                        value={values.color ?? ''}
                        label={t('inventory.fields.color')}
                        onChange={(e) => setField('color', e.target.value || undefined)}
                      >
                        <MenuItem value=""><em>—</em></MenuItem>
                        {['red', 'white', 'rosé', 'orange'].map((c) => (
                          <MenuItem key={c} value={c}>{t(`inventory.color.${c}`)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.region')}
                      value={values.region ?? ''}
                      onChange={(e) => setField('region', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.alcoholDegree')}
                      type="number"
                      value={values.alcoholDegree ?? ''}
                      onChange={(e) => setField('alcoholDegree', numField(e.target.value))}
                      inputProps={{ min: 0, max: 100, step: 0.1 }}
                      InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">%</Typography> }}
                    />
                  </Grid>
                </>
              )}

              {/* Sparkling essential */}
              {isSparkling && (
                <>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.vintage')}
                      type="number"
                      value={values.vintage ?? ''}
                      onChange={(e) => setField('vintage', numField(e.target.value))}
                      inputProps={{ min: 1800, max: 2100, step: 1 }}
                      helperText={t('inventory.fields.noVintage')}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('inventory.fields.sparklingType')}</InputLabel>
                      <Select
                        value={values.sparklingType ?? ''}
                        label={t('inventory.fields.sparklingType')}
                        onChange={(e) => setField('sparklingType', e.target.value || undefined)}
                      >
                        <MenuItem value=""><em>—</em></MenuItem>
                        {['champagne', 'cremant', 'prosecco', 'cava', 'petnat', 'other'].map((s) => (
                          <MenuItem key={s} value={s}>{t(`inventory.sparklingTypes.${s}`)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('inventory.fields.sugarLevel')}</InputLabel>
                      <Select
                        value={values.sugarLevel ?? ''}
                        label={t('inventory.fields.sugarLevel')}
                        onChange={(e) => setField('sugarLevel', e.target.value || undefined)}
                      >
                        <MenuItem value=""><em>—</em></MenuItem>
                        {['extra-brut', 'brut', 'extra-sec', 'sec', 'demi-sec', 'doux'].map((s) => (
                          <MenuItem key={s} value={s}>{t(`inventory.sugarLevels.${s}`)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </>
              )}

              {/* Spirit essential */}
              {isSpirit && (
                <>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('inventory.fields.spiritType')}</InputLabel>
                      <Select
                        value={values.spiritType ?? ''}
                        label={t('inventory.fields.spiritType')}
                        onChange={(e) => setField('spiritType', e.target.value || undefined)}
                      >
                        <MenuItem value=""><em>—</em></MenuItem>
                        {['whisky', 'rhum', 'gin', 'cognac', 'calvados', 'armagnac', 'vodka', 'tequila', 'mezcal', 'liqueur', 'other'].map((s) => (
                          <MenuItem key={s} value={s}>{t(`inventory.spiritTypes.${s}`)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.edition')}
                      value={values.edition ?? ''}
                      onChange={(e) => setField('edition', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small" required
                      label={t('inventory.fields.alcoholDegree')}
                      type="number"
                      value={values.alcoholDegree ?? ''}
                      onChange={(e) => setField('alcoholDegree', numField(e.target.value))}
                      inputProps={{ min: 0, max: 100, step: 0.1 }}
                      InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">%</Typography> }}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.declaredAge')}
                      type="number"
                      value={values.declaredAge ?? ''}
                      onChange={(e) => setField('declaredAge', numField(e.target.value))}
                      inputProps={{ min: 0, max: 200, step: 1 }}
                      InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">{t('inventory.fields.declaredAgeUnit')}</Typography> }}
                    />
                  </Grid>
                </>
              )}

              {/* Cigar essential */}
              {isCigar && (
                <>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.format')}
                      value={values.format ?? ''}
                      onChange={(e) => setField('format', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small" required
                      label={t('inventory.fields.quantity')}
                      type="number"
                      value={values.quantity ?? ''}
                      onChange={(e) => setField('quantity', numField(e.target.value))}
                      inputProps={{ min: 1, step: 1 }}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.manufactureYear')}
                      type="number"
                      value={values.manufactureYear ?? ''}
                      onChange={(e) => setField('manufactureYear', numField(e.target.value))}
                      inputProps={{ min: 1900, max: 2100, step: 1 }}
                    />
                  </Grid>
                </>
              )}

              {/* Peak maturity window — wine + sparkling only */}
              {isWineOrSparkling && (
                <>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {t('inventory.fields.peakMaturity')}
                      </Typography>
                    </Divider>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.peakMaturityFrom')}
                      type="number"
                      value={values.peakMaturityFrom ?? ''}
                      onChange={(e) => setField('peakMaturityFrom', e.target.value ? Number(e.target.value) : null)}
                      inputProps={{ min: 1800, max: 2200, step: 1 }}
                      helperText={t('inventory.fields.peakMaturityFromHint')}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth size="small"
                      label={t('inventory.fields.peakMaturityTo')}
                      type="number"
                      value={values.peakMaturityTo ?? ''}
                      onChange={(e) => setField('peakMaturityTo', e.target.value ? Number(e.target.value) : null)}
                      inputProps={{ min: 1800, max: 2200, step: 1 }}
                      helperText={t('inventory.fields.peakMaturityToHint')}
                    />
                  </Grid>
                </>
              )}
            </Grid>

            {/* Suggestion banner */}
            {suggestion && suggestion.peakMaturityFrom != null && suggestion.peakMaturityTo != null && (
              <Alert
                severity="info"
                icon={<AutoAwesomeIcon fontSize="small" />}
                sx={{ mt: 2 }}
                action={
                  <Button size="small" onClick={applySuggestion} color="inherit">
                    {t('inventory.maturitySuggestion.apply')}
                  </Button>
                }
              >
                <strong>{suggestion.reference.name}</strong>
                {' — '}
                {t('inventory.maturitySuggestion.window', {
                  from: suggestion.peakMaturityFrom,
                  to: suggestion.peakMaturityTo,
                })}
              </Alert>
            )}
          </Box>

          <Divider />

          {/* ── Section 3 : Compléments ──────────────────────────────────── */}
          <Box>
            <Tooltip title={showOptionals ? t('actions.showLess') : t('actions.showMore')}>
              <Button
                size="small"
                variant="text"
                onClick={() => setShowOptionals((prev) => !prev)}
                startIcon={showOptionals ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              >
                {showOptionals ? t('actions.showLess') : t('actions.showMore')}
              </Button>
            </Tooltip>

            <Collapse in={showOptionals}>
              <Grid container spacing={2} sx={{ mt: 1 }}>

                {/* Common optionals */}
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small"
                    label={t('inventory.fields.collection')}
                    value={values.collection ?? ''}
                    onChange={(e) => setField('collection', e.target.value)}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small"
                    label={t('inventory.fields.purchasePrice')}
                    type="number"
                    value={values.purchasePrice ?? ''}
                    onChange={(e) => setField('purchasePrice', numField(e.target.value))}
                    InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">€</Typography> }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth size="small"
                    label={t('inventory.fields.purchasePlace')}
                    value={values.purchasePlace ?? ''}
                    onChange={(e) => setField('purchasePlace', e.target.value)}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small"
                    label={t('inventory.fields.estimatedValue')}
                    type="number"
                    value={values.estimatedValue ?? ''}
                    onChange={(e) => setField('estimatedValue', numField(e.target.value))}
                    InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">€</Typography> }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" multiline rows={3}
                    label={t('inventory.fields.notes')}
                    value={values.notes ?? ''}
                    onChange={(e) => setField('notes', e.target.value)}
                  />
                </Grid>

                {/* Category-specific optionals */}
                {(isWine || isSparkling) && (
                  <>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.bottleSize')}
                        value={values.bottleSize ?? ''}
                        onChange={(e) => setField('bottleSize', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.serviceTemp')}
                        value={values.serviceTemp ?? ''}
                        onChange={(e) => setField('serviceTemp', e.target.value)}
                      />
                    </Grid>
                    {isWine && (
                      <>
                        <Grid item xs={12}>
                          <TextField fullWidth size="small"
                            label={t('inventory.fields.grapeVarieties')}
                            placeholder={t('inventory.fields.grapeVarietiesHint')}
                            value={(values.grapeVarieties ?? []).join(', ')}
                            onChange={(e) =>
                              setField('grapeVarieties', e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : [])
                            }
                          />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <TextField fullWidth size="small"
                            label={t('inventory.fields.lotNumber')}
                            value={values.lotNumber ?? ''}
                            onChange={(e) => setField('lotNumber', e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Stack direction="row" alignItems="center">
                            <Chip
                              label={t('inventory.fields.needsAeration')}
                              variant={values.needsAeration ? 'filled' : 'outlined'}
                              color={values.needsAeration ? 'info' : 'default'}
                              onClick={() => setField('needsAeration', !values.needsAeration)}
                              sx={{ cursor: 'pointer' }}
                            />
                          </Stack>
                        </Grid>
                      </>
                    )}
                    {isSparkling && (
                      <>
                        <Grid item xs={6} sm={3}>
                          <TextField fullWidth size="small"
                            label={t('inventory.fields.baseYear')}
                            type="number"
                            value={values.baseYear ?? ''}
                            onChange={(e) => setField('baseYear', numField(e.target.value))}
                            inputProps={{ min: 1800, max: 2100 }}
                          />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <TextField fullWidth size="small" type="date"
                            label={t('inventory.fields.disgorgingDate')}
                            InputLabelProps={{ shrink: true }}
                            value={typeof values.disgorgingDate === 'string' ? values.disgorgingDate.split('T')[0] : ''}
                            onChange={(e) => setField('disgorgingDate', e.target.value || null)}
                          />
                        </Grid>
                      </>
                    )}
                  </>
                )}

                {isSpirit && (
                  <>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.caskType')}
                        value={values.caskType ?? ''}
                        onChange={(e) => setField('caskType', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.aromaticProfile')}
                        value={values.aromaticProfile ?? ''}
                        onChange={(e) => setField('aromaticProfile', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.additions')}
                        value={values.additions ?? ''}
                        onChange={(e) => setField('additions', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.bottleSize')}
                        value={values.bottleSize ?? ''}
                        onChange={(e) => setField('bottleSize', e.target.value)}
                      />
                    </Grid>
                  </>
                )}

                {isCigar && (
                  <>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.leafOrigin')}
                        value={values.leafOrigin ?? ''}
                        onChange={(e) => setField('leafOrigin', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.factoryCode')}
                        value={values.factoryCode ?? ''}
                        onChange={(e) => setField('factoryCode', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.recommendedHumidity')}
                        type="number"
                        value={values.recommendedHumidity ?? ''}
                        onChange={(e) => setField('recommendedHumidity', numField(e.target.value))}
                        inputProps={{ min: 50, max: 100 }}
                        InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">%</Typography> }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small"
                        label={t('inventory.fields.humidificationSystem')}
                        value={values.humidificationSystem ?? ''}
                        onChange={(e) => setField('humidificationSystem', e.target.value)}
                      />
                    </Grid>
                  </>
                )}

                {/* Opened status */}
                <Grid item xs={12}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                      size="small"
                      variant={values.isOpened ? 'contained' : 'outlined'}
                      color="warning"
                      onClick={() => {
                        const next = !values.isOpened;
                        setField('isOpened', next);
                        if (next && !values.openedAt) {
                          setField('openedAt', new Date().toISOString().split('T')[0]);
                        }
                      }}
                    >
                      {values.isOpened ? '✓ ' : ''}{t('inventory.fields.isOpened')}
                    </Button>
                  </Stack>
                </Grid>

                {values.isOpened && (
                  <>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">{t('inventory.fields.fillLevel')}</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        {([100, 75, 50, 25, 0] as const).map((val) => (
                          <Chip
                            key={val}
                            label={t(`inventory.fillLevels.${val === 100 ? 'full' : val === 75 ? 'threeQuarters' : val === 50 ? 'half' : val === 25 ? 'quarter' : 'empty'}`)}
                            variant={values.fillLevel === val ? 'filled' : 'outlined'}
                            color={values.fillLevel === val ? 'warning' : 'default'}
                            size="small"
                            onClick={() => setField('fillLevel', val)}
                            sx={{ cursor: 'pointer' }}
                          />
                        ))}
                      </Stack>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth size="small" type="date"
                        label={t('inventory.fields.openedAt')}
                        InputLabelProps={{ shrink: true }}
                        value={typeof values.openedAt === 'string' ? values.openedAt.split('T')[0] : ''}
                        onChange={(e) => setField('openedAt', e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth size="small" type="date"
                        label={t('inventory.fields.reminderDate')}
                        InputLabelProps={{ shrink: true }}
                        value={typeof values.reminderDate === 'string' ? values.reminderDate.split('T')[0] : ''}
                        onChange={(e) => setField('reminderDate', e.target.value)}
                      />
                    </Grid>
                  </>
                )}

              </Grid>
            </Collapse>
          </Box>
        </Stack>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button variant="outlined" onClick={onClose} disabled={isSubmitting}>
          {t('actions.cancel')}
        </Button>
        <Button
          type="submit"
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!canSave || isSubmitting}
        >
          {isSubmitting
            ? t('status.saving')
            : isEditing
              ? t('actions.update')
              : t('inventory.saveMinimal')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
