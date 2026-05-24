'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Warehouse as CellarIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useCellars, useCreateCellar, useUpdateCellar, useDeleteCellar } from '../../hooks/useCellars';
import { Cellar } from '@/lib/cellars/types';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { useViewMode } from '@/hooks/useViewMode';

export const CellarDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { data: cellars, isLoading, isError } = useCellars();
  const createMutation = useCreateCellar();
  const updateMutation = useUpdateCellar();
  const deleteMutation = useDeleteCellar();

  const [viewMode, setViewMode] = useViewMode('cellars');
  const [openForm, setOpenForm] = useState(false);
  const [editingCellar, setEditingCellar] = useState<Cellar | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: 'VINTAGE' | 'COOLER' | 'SHELF';
  }>({
    name: '',
    description: '',
    type: 'VINTAGE'
  });

  const handleOpenForm = (cellar?: Cellar) => {
    if (cellar) {
      setEditingCellar(cellar);
      setFormData({
        name: cellar.name,
        description: cellar.description || '',
        type: cellar.type
      });
    } else {
      setEditingCellar(null);
      setFormData({ name: '', description: '', type: 'VINTAGE' });
    }
    setOpenForm(true);
  };

  const handleCloseForm = () => {
    setOpenForm(false);
  };

  const handleSubmit = async () => {
    if (editingCellar) {
      await updateMutation.mutateAsync({ id: editingCellar.id, data: formData });
    } else {
      await createMutation.mutateAsync(formData);
    }
    handleCloseForm();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('cellars.deleteConfirm'))) {
      await deleteMutation.mutateAsync(id);
    }
  };

  if (isLoading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  if (isError) return <Alert severity="error">{t('status.error')}</Alert>;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          {t('cellars.title')}
        </Typography>
        <Box display="flex" gap={1} alignItems="center">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenForm()}
          >
            {t('cellars.addCellar')}
          </Button>
        </Box>
      </Box>

      {cellars?.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            border: '2px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'action.hover',
            mt: 4
          }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {t('cellars.noCellars')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('cellars.noCellarsDesc')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenForm()}
          >
            {t('cellars.addCellar')}
          </Button>
        </Box>
      ) : viewMode === 'grid' ? (
        <Grid container spacing={3}>
          {cellars?.map((cellar) => (
            <Grid item xs={12} sm={6} md={4} key={cellar.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="center" mb={2}>
                    <CellarIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6" component="div">
                      {cellar.name}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {t(`cellars.types.${cellar.type}`)}
                  </Typography>
                  {cellar.description && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {cellar.description}
                    </Typography>
                  )}
                  {cellar.stats && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                      <Chip size="small" label={`${cellar.stats.totalItems} ${t('cellars.stats.items')}`} />
                      {cellar.stats.alertCount > 0 && (
                        <Chip size="small" color="warning" label={`${cellar.stats.alertCount} ${t('cellars.stats.alerts')}`} />
                      )}
                      {cellar.stats.estimatedValue != null && (
                        <Chip size="small" variant="outlined" label={`~${Math.round(cellar.stats.estimatedValue)} €`} />
                      )}
                    </Box>
                  )}
                </CardContent>
                <CardActions>
                  <IconButton size="small" onClick={() => handleOpenForm(cellar)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(cellar.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }} />
                <TableCell>{t('cellars.name')}</TableCell>
                <TableCell>{t('cellars.type')}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('cellars.description')}</TableCell>
                <TableCell align="right">{t('cellars.stats.items')}</TableCell>
                <TableCell align="right">{t('cellars.stats.alerts')}</TableCell>
                <TableCell align="right">{t('admin.maturityRefs.columns.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cellars?.map((cellar) => (
                <TableRow key={cellar.id} hover>
                  <TableCell>
                    <CellarIcon color="primary" fontSize="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{cellar.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={t(`cellars.types.${cellar.type}`)} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                      {cellar.description ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{cellar.stats?.totalItems ?? 0}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    {cellar.stats?.alertCount ? (
                      <Chip size="small" color="warning" label={cellar.stats.alertCount} />
                    ) : (
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={t('actions.edit')}>
                      <IconButton size="small" onClick={() => handleOpenForm(cellar)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('actions.delete')}>
                      <IconButton size="small" color="error" onClick={() => handleDelete(cellar.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Form Dialog */}
      <Dialog open={openForm} onClose={handleCloseForm} fullWidth maxWidth="sm">
        <DialogTitle>
          {editingCellar ? t('cellars.editCellar') : t('cellars.addCellar')}
        </DialogTitle>
        <DialogContent>
          <Box pt={1} display="flex" flexDirection="column" gap={2}>
            <TextField
              fullWidth
              label={t('cellars.name')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <TextField
              fullWidth
              select
              label={t('cellars.type')}
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'VINTAGE' | 'COOLER' | 'SHELF' })}
            >
              <MenuItem value="VINTAGE">{t('cellars.types.VINTAGE')}</MenuItem>
              <MenuItem value="COOLER">{t('cellars.types.COOLER')}</MenuItem>
              <MenuItem value="SHELF">{t('cellars.types.SHELF')}</MenuItem>
            </TextField>
            <TextField
              fullWidth
              multiline
              rows={3}
              label={t('cellars.description')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForm}>{t('actions.cancel')}</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.name}
          >
            {editingCellar ? t('actions.save') : t('actions.add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
