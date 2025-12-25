import React, { useState } from 'react';
import { Box, Button, Grid, TextField, Typography, Stack, Alert } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import api from '../services/apiClient';

const TobaccoAddForm = ({ onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: '',
    brand: '',
    origin_country: '',
    format: '',
    wrapper: '',
    binder: '',
    quantity: 1,
    purchase_price: 0,
    current_value: 0,
    purchase_date: '',
    notes: '',
  });

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.name) { setError('Le nom est obligatoire'); return; }
    try {
      setLoading(true);
      await api.createTobacco(form);
      if (onClose) onClose();
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Ajouter un produit tabac</Typography>
        <Button size="small" onClick={onClose} startIcon={<CloseIcon />} variant="text">Fermer</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Nom" name="name" value={form.name} onChange={handleChange} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Marque" name="brand" value={form.brand} onChange={handleChange} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Pays d'origine" name="origin_country" value={form.origin_country} onChange={handleChange} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Format" name="format" value={form.format} onChange={handleChange} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Cape (Wrapper)" name="wrapper" value={form.wrapper} onChange={handleChange} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Sous-cape (Binder)" name="binder" value={form.binder} onChange={handleChange} size="small" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Quantité" name="quantity" value={form.quantity} onChange={handleChange} inputProps={{ min: 1 }} size="small" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Prix d'achat (€)" name="purchase_price" value={form.purchase_price} onChange={handleChange} inputProps={{ min: 0, step: 0.01 }} size="small" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Valeur actuelle (€)" name="current_value" value={form.current_value} onChange={handleChange} inputProps={{ min: 0, step: 0.01 }} size="small" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box sx={{ p: 1, border: '1px solid #ccc', borderRadius: 1 }}>
              <Typography variant="caption">ROI:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: ((form.current_value || 0) - (form.purchase_price || 0)) >= 0 ? 'green' : 'red' }}>
                {((form.current_value || 0) - (form.purchase_price || 0)).toFixed(2)}€
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth type="date" label="Date d'achat" name="purchase_date" value={form.purchase_date} onChange={handleChange} size="small" InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Notes / Journal de dégustation" name="notes" value={form.notes} onChange={handleChange} size="small" multiline rows={3} />
          </Grid>
          <Grid item xs={12}>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="outlined" onClick={onClose} disabled={loading}>Annuler</Button>
              <Button variant="contained" type="submit" disabled={loading}>{loading ? 'Création...' : 'Créer'}</Button>
            </Stack>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default TobaccoAddForm;
