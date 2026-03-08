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
  Alert
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Storage as StorageIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useCellars, useCreateCellar, useUpdateCellar, useDeleteCellar } from '../../hooks/useCellars';

export const CellarDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { data: cellars, isLoading, isError } = useCellars();
  const createMutation = useCreateCellar();
  const updateMutation = useUpdateCellar();
  const deleteMutation = useDeleteCellar();

  const [openForm, setOpenForm] = useState(false);
  const [editingCellar, setEditingCellar] = useState<any>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: 'VINTAGE' | 'COOLER' | 'SHELF';
  }>({
    name: '',
    description: '',
    type: 'VINTAGE'
  });

  const handleOpenForm = (cellar?: any) => {
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
      await createMutation.mutateAsync(formData as any);
    }
    handleCloseForm();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('cellars.deleteConfirm'))) {
      await deleteMutation.mutateAsync(id);
    }
  };

  if (isLoading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  if (isError) return <Alert severity="error">{t('common.status.error')}</Alert>;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          {t('cellars.title')}
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          onClick={() => handleOpenForm()}
        >
          {t('cellars.addCellar')}
        </Button>
      </Box>

      {cellars?.length === 0 ? (
        <Typography variant="body1" color="text.secondary" textAlign="center" mt={4}>
          {t('cellars.noCellars')}
        </Typography>
      ) : (
        <Grid container spacing={3}>
          {cellars?.map((cellar) => (
            <Grid item xs={12} sm={6} md={4} key={cellar.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="center" mb={2}>
                    <StorageIcon color="primary" sx={{ mr: 1 }} />
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
          <Button onClick={handleCloseForm}>{t('common.actions.cancel')}</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            disabled={!formData.name}
          >
            {editingCellar ? t('common.actions.save') : t('common.actions.add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
