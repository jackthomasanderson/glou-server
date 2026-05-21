'use client';
import React, { useState } from 'react';
import {
  Paper, Typography, Box, Button, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Skeleton, IconButton, Tooltip, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem,
  Stack, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from 'react-i18next';
import {
  useMaturityReferences,
  useCreateMaturityReference,
  useUpdateMaturityReference,
  useDeleteMaturityReference,
  MaturityReference,
  MaturityReferenceInput,
} from '@/hooks/useAdmin';

const EMPTY_FORM: MaturityReferenceInput = {
  name: '',
  category: 'wine',
  mode: 'RELATIVE',
  windowFrom: 0,
  windowTo: 0,
  region: null,
  color: null,
  producer: null,
  vintageFrom: null,
  vintageTo: null,
};

function windowLabel(ref: MaturityReference): string {
  if (ref.mode === 'ABSOLUTE') {
    return `${ref.windowFrom} – ${ref.windowTo}`;
  }
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return `${sign(ref.windowFrom)} → ${sign(ref.windowTo)} ans`;
}

function criteriaLabel(ref: MaturityReference): string {
  const parts: string[] = [];
  if (ref.producer) parts.push(ref.producer);
  if (ref.region) parts.push(ref.region);
  if (ref.color) parts.push(ref.color);
  if (ref.vintageFrom != null && ref.vintageTo != null) parts.push(`${ref.vintageFrom}–${ref.vintageTo}`);
  return parts.join(' · ') || '—';
}

interface FormDialogProps {
  open: boolean;
  editing: MaturityReference | null;
  onClose: () => void;
}

function FormDialog({ open, editing, onClose }: FormDialogProps) {
  const { t } = useTranslation();
  const { mutate: create, isPending: isCreating } = useCreateMaturityReference();
  const { mutate: update, isPending: isUpdating } = useUpdateMaturityReference();

  const [form, setForm] = useState<MaturityReferenceInput>(editing ?? EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setForm(editing ?? EMPTY_FORM);
    setError(null);
  }, [editing, open]);

  const setField = (field: keyof MaturityReferenceInput, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const numField = (val: unknown) => {
    const n = Number(val);
    return isNaN(n) ? null : n;
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setError(t('admin.maturityRefs.errors.nameRequired')); return; }
    if (form.windowTo < form.windowFrom) { setError(t('admin.maturityRefs.errors.windowInvalid')); return; }
    setError(null);

    if (editing) {
      update({ id: editing.id, patch: form }, { onSuccess: onClose });
    } else {
      create(form, { onSuccess: onClose });
    }
  };

  const isPending = isCreating || isUpdating;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editing ? t('admin.maturityRefs.editTitle') : t('admin.maturityRefs.addTitle')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label={t('admin.maturityRefs.fields.name')}
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
            fullWidth
            size="small"
          />

          <Stack direction="row" spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('bottle.fields.category')}</InputLabel>
              <Select
                value={form.category}
                label={t('bottle.fields.category')}
                onChange={(e) => setField('category', e.target.value)}
              >
                {(['wine', 'sparkling', 'spirit', 'cigar'] as const).map((c) => (
                  <MenuItem key={c} value={c}>{t(`categories.${c}`)}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>{t('admin.maturityRefs.fields.mode')}</InputLabel>
              <Select
                value={form.mode}
                label={t('admin.maturityRefs.fields.mode')}
                onChange={(e) => setField('mode', e.target.value)}
              >
                <MenuItem value="RELATIVE">{t('admin.maturityRefs.modes.relative')}</MenuItem>
                <MenuItem value="ABSOLUTE">{t('admin.maturityRefs.modes.absolute')}</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              label={t('admin.maturityRefs.fields.windowFrom')}
              type="number"
              value={form.windowFrom}
              onChange={(e) => setField('windowFrom', numField(e.target.value) ?? 0)}
              fullWidth
              size="small"
              helperText={form.mode === 'RELATIVE' ? t('admin.maturityRefs.hints.relativeWindow') : undefined}
            />
            <TextField
              label={t('admin.maturityRefs.fields.windowTo')}
              type="number"
              value={form.windowTo}
              onChange={(e) => setField('windowTo', numField(e.target.value) ?? 0)}
              fullWidth
              size="small"
            />
          </Stack>

          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            {t('admin.maturityRefs.hints.criteria')}
          </Typography>

          <Stack direction="row" spacing={2}>
            <TextField
              label={t('bottle.fields.producer')}
              value={form.producer ?? ''}
              onChange={(e) => setField('producer', e.target.value || null)}
              fullWidth
              size="small"
            />
            <TextField
              label={t('bottle.fields.region')}
              value={form.region ?? ''}
              onChange={(e) => setField('region', e.target.value || null)}
              fullWidth
              size="small"
            />
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              label={t('bottle.fields.color')}
              value={form.color ?? ''}
              onChange={(e) => setField('color', e.target.value || null)}
              fullWidth
              size="small"
            />
            <TextField
              label={t('admin.maturityRefs.fields.vintageFrom')}
              type="number"
              value={form.vintageFrom ?? ''}
              onChange={(e) => setField('vintageFrom', e.target.value ? numField(e.target.value) : null)}
              fullWidth
              size="small"
              inputProps={{ min: 1800, max: 2200 }}
            />
            <TextField
              label={t('admin.maturityRefs.fields.vintageTo')}
              type="number"
              value={form.vintageTo ?? ''}
              onChange={(e) => setField('vintageTo', e.target.value ? numField(e.target.value) : null)}
              fullWidth
              size="small"
              inputProps={{ min: 1800, max: 2200 }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ pb: 2, px: 3 }}>
        <Button onClick={onClose} disabled={isPending}>{t('actions.cancel')}</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={isPending}>
          {isPending ? t('status.saving') : t('actions.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function MaturityReferencesSection() {
  const { t } = useTranslation();
  const { data: refs, isLoading } = useMaturityReferences();
  const { mutate: deleteRef } = useDeleteMaturityReference();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaturityReference | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaturityReference | null>(null);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (ref: MaturityReference) => { setEditing(ref); setDialogOpen(true); };
  const confirmDelete = () => {
    if (deleteTarget) deleteRef(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  return (
    <>
      <Paper sx={{ p: 4, mt: 4, borderRadius: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box>
            <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
              {t('admin.maturityRefs.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('admin.maturityRefs.subtitle')}
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} size="small">
            {t('admin.maturityRefs.add')}
          </Button>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('admin.maturityRefs.columns.name')}</TableCell>
                <TableCell>{t('admin.maturityRefs.columns.category')}</TableCell>
                <TableCell>{t('admin.maturityRefs.columns.criteria')}</TableCell>
                <TableCell>{t('admin.maturityRefs.columns.window')}</TableCell>
                <TableCell align="center">{t('admin.maturityRefs.columns.bottles')}</TableCell>
                <TableCell align="right">{t('admin.maturityRefs.columns.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, c) => (
                        <TableCell key={c}><Skeleton variant="text" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : refs?.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        {t('admin.maturityRefs.empty')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )
                : refs?.map((ref) => (
                  <TableRow key={ref.id}>
                    <TableCell sx={{ fontWeight: 500 }}>{ref.name}</TableCell>
                    <TableCell>
                      <Chip label={t(`categories.${ref.category}`)} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                      {criteriaLabel(ref)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      <Chip
                        label={`${ref.mode === 'RELATIVE' ? '±' : ''}${windowLabel(ref)}`}
                        size="small"
                        color={ref.mode === 'RELATIVE' ? 'info' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" color="text.secondary">{ref.bottleCount}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={t('actions.edit')}>
                        <IconButton size="small" onClick={() => openEdit(ref)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('actions.delete')}>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(ref)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <FormDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => setDialogOpen(false)}
      />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('admin.maturityRefs.deleteConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('admin.maturityRefs.deleteConfirmBody', { name: deleteTarget?.name })}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ pb: 2, px: 3 }}>
          <Button onClick={() => setDeleteTarget(null)}>{t('actions.cancel')}</Button>
          <Button variant="contained" color="error" onClick={confirmDelete}>
            {t('actions.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
