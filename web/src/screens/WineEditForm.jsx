import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Grid,
  Typography,
  useTheme,
  Stack,
  Alert,
  Dialog,
} from '@mui/material';
import {
  Close as CloseIcon,
} from '@mui/icons-material';

/**
 * Wine Edit Form - Form to update an existing wine
 */
export const WineEditForm = ({ wine, onClose, onSave }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState(wine || {});

  useEffect(() => {
    if (wine) {
      setFormData(wine);
    }
  }, [wine]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value ? parseFloat(value) : null) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name || !formData.region || !formData.vintage || !formData.type) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (formData.vintage < 1900 || formData.vintage > new Date().getFullYear()) {
      setError('Millésime invalide');
      return;
    }

    if (formData.quantity && formData.quantity < 0) {
      setError('La quantité ne peut pas être négative');
      return;
    }

    if (formData.rating && (formData.rating < 0 || formData.rating > 5)) {
      setError('La note doit être entre 0 et 5');
      return;
    }

    if (formData.alcohol_level && (formData.alcohol_level < 0 || formData.alcohol_level > 20)) {
      setError('Le degré alcoolique doit être entre 0 et 20');
      return;
    }

    // Validate apogee dates
    if (formData.min_apogee_date && formData.max_apogee_date) {
      const minDate = new Date(formData.min_apogee_date);
      const maxDate = new Date(formData.max_apogee_date);
      if (minDate > maxDate) {
        setError('La date min apogée doit être avant la date max');
        return;
      }
    }

    try {
      setLoading(true);
      await onSave(formData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const wineTypes = ['Red', 'White', 'Rosé', 'Sparkling'];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h6" sx={{ color: theme.palette.onSurface }}>
          Modifier une bouteille
        </Typography>
        <Button
          size="small"
          onClick={onClose}
          startIcon={<CloseIcon />}
          variant="text"
        >
          Fermer
        </Button>
      </Box>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={2}>
          {/* Required Fields Section */}
          <Grid item xs={12}>
            <Typography
              variant="subtitle2"
              sx={{
                color: theme.palette.onSurfaceVariant,
                mb: 1,
              }}
            >
              Informations obligatoires
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Nom du vin *"
              name="name"
              value={formData.name || ''}
              onChange={handleChange}
              placeholder="ex: Château Margaux"
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Producteur"
              name="producer"
              value={formData.producer || ''}
              onChange={handleChange}
              placeholder="ex: Château Margaux SA"
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Région / Appellation *"
              name="region"
              value={formData.region || ''}
              onChange={handleChange}
              placeholder="ex: Bordeaux"
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="Millésime *"
              name="vintage"
              type="number"
              value={formData.vintage || ''}
              onChange={handleChange}
              inputProps={{ min: 1900, max: new Date().getFullYear() }}
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              select
              label="Type *"
              name="type"
              value={formData.type || ''}
              onChange={handleChange}
              SelectProps={{ native: true }}
              size="small"
            >
              <option value="">Sélectionner...</option>
              {wineTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </TextField>
          </Grid>

          {/* Stock Section */}
          <Grid item xs={12}>
            <Typography
              variant="subtitle2"
              sx={{
                color: theme.palette.onSurfaceVariant,
                mb: 1,
                mt: 1,
              }}
            >
              Stock & Localisation
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Quantité"
              name="quantity"
              type="number"
              value={formData.quantity || 0}
              onChange={handleChange}
              inputProps={{ min: 0 }}
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Consommées"
              name="consumed"
              type="number"
              value={formData.consumed || 0}
              onChange={handleChange}
              inputProps={{ min: 0 }}
              size="small"
            />
          </Grid>

          {/* Characteristics Section */}
          <Grid item xs={12}>
            <Typography
              variant="subtitle2"
              sx={{
                color: theme.palette.onSurfaceVariant,
                mb: 1,
                mt: 1,
              }}
            >
              Caractéristiques
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Degré alcoolique"
              name="alcohol_level"
              type="number"
              value={formData.alcohol_level || ''}
              onChange={handleChange}
              inputProps={{ min: 0, max: 20, step: 0.5 }}
              size="small"
              helperText="Entre 0 et 20%"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Prix d'achat (€)"
              name="price"
              type="number"
              value={formData.price || ''}
              onChange={handleChange}
              inputProps={{ min: 0 }}
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Note"
              name="rating"
              type="number"
              value={formData.rating || ''}
              onChange={handleChange}
              inputProps={{ min: 0, max: 5, step: 0.5 }}
              size="small"
              helperText="Entre 0 et 5"
            />
          </Grid>

          {/* Apogee Section */}
          <Grid item xs={12}>
            <Typography
              variant="subtitle2"
              sx={{
                color: theme.palette.onSurfaceVariant,
                mb: 1,
                mt: 1,
              }}
            >
              Fenêtre d'apogée
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="À boire à partir du"
              name="min_apogee_date"
              type="date"
              value={formData.min_apogee_date ? formData.min_apogee_date.split('T')[0] : ''}
              onChange={handleChange}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="À boire jusqu'au"
              name="max_apogee_date"
              type="date"
              value={formData.max_apogee_date ? formData.max_apogee_date.split('T')[0] : ''}
              onChange={handleChange}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Consumption Date */}
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Date dernière dégustation"
              name="consumption_date"
              type="date"
              value={formData.consumption_date ? formData.consumption_date.split('T')[0] : ''}
              onChange={handleChange}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Comments */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Commentaires & Notes"
              name="comments"
              value={formData.comments || ''}
              onChange={handleChange}
              multiline
              rows={3}
              placeholder="Impressions de dégustation, recommandations, etc."
              size="small"
            />
          </Grid>

          {/* Actions */}
          <Grid item xs={12}>
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                onClick={onClose}
                disabled={loading}
              >
                Annuler
              </Button>
              <Button
                variant="contained"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Mise à jour...' : 'Mettre à jour'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default WineEditForm;
