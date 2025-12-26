import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  useTheme,
  Stack,
  Alert,
  Paper,
  Divider,
  Grid,
} from '@mui/material';
import {
  Close as CloseIcon,
} from '@mui/icons-material';
import { HelpIcon, HelpLabel } from '../components/HelpIcon';

export const WineCreateForm = ({ onClose, onSave }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    producer: '',
    region: '',
    vintage: new Date().getFullYear(),
    type: 'Red',
    quantity: 1,
    alcohol_level: 12.5,
    price: 0,
    current_value: 0,
    rating: 0,
    min_apogee_date: '',
    max_apogee_date: '',
    comments: '',
  });

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value };
      const v = parseInt(next.vintage || new Date().getFullYear(), 10);
      const t = next.type;
      const toISO = (y) => new Date(y, 0, 1).toISOString().slice(0, 10);
      let start = null, end = null;
      if (t === 'Red') { start = v + 3; end = v + 10; }
      else if (t === 'White') { start = v + 2; end = v + 6; }
      else if (t === 'Rosé') { start = v + 0; end = v + 2; }
      else if (t === 'Sparkling') { start = v + 3; end = v + 8; }
      else if (t === 'Beer') { start = v + 0; end = v + 2; }
      else if (t === 'Spirit') { start = null; end = null; }
      if (start && end) {
        next.min_apogee_date = toISO(start);
        next.max_apogee_date = toISO(end);
      }
      return next;
    });
  };

  const handleSubmit = async (e, addAnother = false) => {
    e.preventDefault();
    setError(null);

    if (!formData.name || !formData.region || !formData.vintage || !formData.type) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (formData.vintage < 1900 || formData.vintage > new Date().getFullYear()) {
      setError('Millésime invalide');
      return;
    }

    if (formData.quantity < 1) {
      setError('La quantité doit être au moins 1');
      return;
    }

    if (formData.rating < 0 || formData.rating > 5) {
      setError('La note doit être entre 0 et 5');
      return;
    }

    if (formData.alcohol_level < 0 || formData.alcohol_level > 20) {
      setError('Le degré alcoolique doit être entre 0 et 20');
      return;
    }

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
      if (addAnother) {
        setFormData(prev => ({
          ...prev,
          name: '',
          vintage: new Date().getFullYear(),
          quantity: 1,
          price: 0,
          current_value: 0,
          rating: 0,
          min_apogee_date: '',
          max_apogee_date: '',
          comments: '',
        }));
        setError(null);
      } else if (onClose) {
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const wineTypes = ['Red', 'White', 'Rosé', 'Sparkling'];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: 'background.default', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h5" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
              Ajouter une bouteille
            </Typography>
            <HelpIcon 
              title="Ajouter une bouteille"
              description="Remplissez ce formulaire pour enregistrer une nouvelle bouteille dans votre collection."
            />
          </Box>
          <Button size="small" onClick={onClose} startIcon={<CloseIcon />} variant="text">
            Fermer
          </Button>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <Typography variant="h6">Informations obligatoires</Typography>
            <HelpIcon title="Champs obligatoires" description="Ces champs doivent être remplis pour enregistrer une bouteille." />
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <HelpLabel label="Nom de la bouteille" helpTitle="Nom de la bouteille" helpDescription="Entrez le nom complet." />
              <TextField fullWidth placeholder="ex: Château Margaux" name="name" value={formData.name} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <HelpLabel label="Producteur" helpTitle="Producteur" helpDescription="Nom du producteur." />
              <TextField fullWidth placeholder="ex: Château Margaux SA" name="producer" value={formData.producer} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <HelpLabel label="Région" helpTitle="Région" helpDescription="Région d'origine." />
              <TextField fullWidth placeholder="ex: Bordeaux" name="region" value={formData.region} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 6, md: 3 }}>
              <HelpLabel label="Millésime" helpTitle="Année" helpDescription="Année de récolte." />
              <TextField fullWidth name="vintage" type="number" value={formData.vintage} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 6, md: 3 }}>
              <HelpLabel label="Type" helpTitle="Type" helpDescription="Catégorie." />
              <TextField fullWidth name="type" select value={formData.type} onChange={handleChange} SelectProps={{ native: true }} size="small" sx={{ mt: 1 }}>
                {wineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <HelpLabel label="Quantité" helpTitle="Quantité" helpDescription="Nombre de bouteilles." />
              <TextField fullWidth name="quantity" type="number" value={formData.quantity} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>
          </Grid>
        </Paper>

        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <Typography variant="h6">Caractéristiques</Typography>
            <HelpIcon title="Caractéristiques" description="Informations supplémentaires." />
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <HelpLabel label="Alcool %" helpTitle="Alcool" helpDescription="Pourcentage d'alcool." />
              <TextField fullWidth name="alcohol_level" type="number" value={formData.alcohol_level} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <HelpLabel label="Prix (€)" helpTitle="Prix" helpDescription="Prix d'achat." />
              <TextField fullWidth name="price" type="number" value={formData.price} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <HelpLabel label="Valeur (€)" helpTitle="Valeur" helpDescription="Valeur actuelle." />
              <TextField fullWidth name="current_value" type="number" value={formData.current_value} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, border: `2px solid ${theme.palette.divider}` }}>
                <Typography variant="caption">ROI:</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: ((formData.current_value || 0) - (formData.price || 0)) >= 0 ? 'success.main' : 'error.main', mt: 0.5 }}>
                  {((formData.current_value || 0) - (formData.price || 0)) >= 0 ? '+' : ''}{((formData.current_value || 0) - (formData.price || 0)).toFixed(2)}€
                </Typography>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <HelpLabel label="Note" helpTitle="Note" helpDescription="0-5 étoiles." />
              <TextField fullWidth name="rating" type="number" value={formData.rating} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>
          </Grid>
        </Paper>

        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <Typography variant="h6">Apogée</Typography>
            <HelpIcon title="Apogée" description="Fenêtre optimale de dégustation." />
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <HelpLabel label="À boire à partir du" helpTitle="Min" helpDescription="Date min." />
              <TextField fullWidth name="min_apogee_date" type="date" value={formData.min_apogee_date} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <HelpLabel label="À boire jusqu'au" helpTitle="Max" helpDescription="Date max." />
              <TextField fullWidth name="max_apogee_date" type="date" value={formData.max_apogee_date} onChange={handleChange} size="small" sx={{ mt: 1 }} />
            </Grid>
          </Grid>
        </Paper>

        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <HelpLabel label="Commentaires" helpTitle="Notes" helpDescription="Vos impressions." />
              <TextField fullWidth name="comments" value={formData.comments} onChange={handleChange} multiline rows={4} size="small" sx={{ mt: 1 }} />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="subtitle2">Photo</Typography>
                <HelpIcon title="Photo" description="Téléchargez une photo (prochainement)." />
              </Box>
              <Button variant="outlined" component="label" size="small" disabled>
                📷 Télécharger (prochainement)
                <input type="file" hidden accept="image/*" />
              </Button>
            </Grid>
          </Grid>
        </Paper>

        <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
            <Button variant="outlined" onClick={onClose} disabled={loading} sx={{ width: { xs: '100%', sm: 'auto' } }}>
              Annuler
            </Button>
            <Button variant="outlined" onClick={(e) => handleSubmit(e, true)} disabled={loading}>
              {loading ? 'Création...' : 'Enregistrer et ajouter'}
            </Button>
            <Button variant="contained" onClick={(e) => handleSubmit(e, false)} disabled={loading}>
              {loading ? 'Création...' : 'Créer'}
            </Button>
          </Stack>
        </Paper>
      </form>
    </Box>
  );
};

export default WineCreateForm;
