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

/**
 * Wine Create Form - Form to create a new wine
 */
export const WineCreateForm = ({ onClose, onSave }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keepOpen, setKeepOpen] = useState(false);
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
      // Predictive apogee suggestion
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

    // Validation
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
      if (addAnother) {
        // Keep producer, type, region for series entry
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
    <Box sx={{ p: { xs: 2 md= 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
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
          <Button
            size="small"
            onClick={onClose}
            startIcon={<CloseIcon />}
            variant="text"
          >
            Fermer
          </Button>
        </Box>
      </Paper>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* Required Fields Section */}
        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <Typography variant="h6" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
              Informations obligatoires
            </Typography>
            <HelpIcon 
              title="Champs obligatoires"
              description="Ces champs doivent être remplis pour enregistrer une bouteille."
            />
          </Box>

          <Grid container spacing={3}>
            <Grid item xs= xs: 12 }}>
              <HelpLabel 
                label="Nom de la bouteille"
                helpTitle="Nom de la bouteille"
                helpDescription="Entrez le nom complet de la bouteille. Exemple: Château Margaux, Opus One, etc."
              />
              <TextField
                fullWidth
                placeholder="ex: Château Margaux"
                name="name"
                value={formData.name}
                onChange={handleChange}
                size="small"
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 12 md= 6 }}>
              <HelpLabel 
                label="Producteur"
                helpTitle="Producteur / Domaine"
                helpDescription="Nom du producteur ou du fabricant."
              />
              <TextField
                fullWidth
                placeholder="ex: Château Margaux SA"
                name="producer"
                value={formData.producer}
                onChange={handleChange}
                size="small"
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 12 md= 6 }}>
              <HelpLabel 
                label="Région / Appellation"
                helpTitle="Région d'origine"
                helpDescription="Région ou origine du produit. Exemple: Bordeaux, Bourgogne, Champagne, etc."
              />
              <TextField
                fullWidth
                placeholder="ex: Bordeaux"
                name="region"
                value={formData.region}
                onChange={handleChange}
                size="small"
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 6 md= 3 }}>
              <HelpLabel 
                label="Millésime"
                helpTitle="Année du millésime"
                helpDescription="L'année de récolte de la bouteille. Doit être entre 1900 et l'année actuelle."
              />
              <TextField
                fullWidth
                name="vintage"
                type="number"
                value={formData.vintage}
                onChange={handleChange}
                inputProps={{ min: 1900, max: new Date().getFullYear() }}
                size="small"
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 6 md= 3 }}>
              <HelpLabel 
                label="Type"
                helpTitle="Type de boisson"
                helpDescription="Catégorie: Rouge, Blanc, Rosé ou Pétillant."
              />
              <TextField
                fullWidth
                name="type"
                select
                value={formData.type}
                onChange={handleChange}
                SelectProps={{ native: true }}
                size="small"
                sx={{ mt: 1 }}
              >
                {wineTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </TextField>
            </Grid>

            <Grid item xs= xs: 12 md= 6 }}>
              <HelpLabel 
                label="Quantité"
                helpTitle="Nombre de bouteilles"
                helpDescription="Nombre de bouteilles de ce produit disponibles."
              />
              <TextField
                fullWidth
                name="quantity"
                type="number"
                value={formData.quantity}
                onChange={handleChange}
                inputProps={{ min: 1 }}
                size="small"
                sx={{ mt: 1 }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Characteristics Section */}
        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <Typography variant="h6" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
              Caractéristiques
            </Typography>
            <HelpIcon 
              title="Caractéristiques du produit"
              description="Informations supplémentaires pour qualifier et évaluer la bouteille."
            />
          </Box>

          <Grid container spacing={3}>
            <Grid item xs= xs: 12 sm= 6 md= 4 }}>
              <HelpLabel 
                label="Degré alcoolique (%)"
                helpTitle="Alcool %"
                helpDescription="Pourcentage d'alcool, généralement entre 7% et 15%. Trouvez cette information sur l'étiquette."
              />
              <TextField
                fullWidth
                name="alcohol_level"
                type="number"
                value={formData.alcohol_level}
                onChange={handleChange}
                inputProps={{ min: 0, max: 20, step: 0.5 }}
                size="small"
                helperText="Entre 0 et 20%"
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 12 sm= 6 md= 4 }}>
              <HelpLabel 
                label="Prix d'achat (€)"
                helpTitle="Prix d'acquisition"
                helpDescription="Montant payé pour l'achat de cette bouteille. Utile pour suivre la valeur de votre collection."
              />
              <TextField
                fullWidth
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.01 }}
                size="small"
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 12 sm= 6 md= 4 }}>
              <HelpLabel 
                label="Valeur actuelle (€)"
                helpTitle="Estimation de valeur"
                helpDescription="Valeur estimée actuelle de la bouteille pour calculer le ROI."
              />
              <TextField
                fullWidth
                type="number"
                name="current_value"
                value={formData.current_value}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.01 }}
                size="small"
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 12 sm= 6 }}>
              <Paper 
                elevation={0} 
                sx={{ 
                  p: 2, 
                  bgcolor: 'background.default', 
                  borderRadius: 1,
                  border: `2px solid ${theme.palette.divider}`,
                }}
              >
                <Typography variant="caption" sx={{ color: theme.palette.onSurfaceVariant, fontWeight: 600 }}>
                  ROI (Plus-value):
                </Typography>
                <Typography 
                  variant="h5" 
                  sx={{ 
                    fontWeight: 700, 
                    color: ((formData.current_value || 0) - (formData.price || 0)) >= 0 ? 'success.main' : 'error.main',
                    mt: 0.5,
                  }}
                >
                  {((formData.current_value || 0) - (formData.price || 0)) >= 0 ? '+' : ''}
                  {((formData.current_value || 0) - (formData.price || 0)).toFixed(2)}€
                </Typography>
              </Paper>
            </Grid>

            <Grid item xs= xs: 12 sm= 6 }}>
              <HelpLabel 
                label="Note de dégustation"
                helpTitle="Évaluation personnelle"
                helpDescription="Votre note personnelle sur 5 étoiles. 0 = non goûté, 5 = excellent."
              />
              <TextField
                fullWidth
                type="number"
                name="rating"
                value={formData.rating}
                onChange={handleChange}
                inputProps={{ min: 0, max: 5, step: 0.5 }}
                size="small"
                helperText="Entre 0 et 5"
                sx={{ mt: 1 }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Apogee Section */}
        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <Typography variant="h6" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
              Fenêtre d'apogée
            </Typography>
            <HelpIcon 
              title="Fenêtre d'apogée"
              description="Période optimale pour déguster cette bouteille. L'application vous avertira lorsque la bouteille atteindra ou dépassera son apogée."
            />
          </Box>

          <Grid container spacing={3}>
            <Grid item xs= xs: 12 md= 6 }}>
              <HelpLabel 
                label="À boire à partir du"
                helpTitle="Date minimale d'apogée"
                helpDescription="Date à partir de laquelle le produit sera à boire. Avant cette date, il peut ne pas être à son meilleur."
              />
              <TextField
                fullWidth
                name="min_apogee_date"
                type="date"
                value={formData.min_apogee_date}
                onChange={handleChange}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 12 md= 6 }}>
              <HelpLabel 
                label="À boire jusqu'au"
                helpTitle="Date maximale d'apogée"
                helpDescription="Date limite pour déguster la bouteille à son meilleur. Après cette date, le produit peut se dégrader."
              />
              <TextField
                fullWidth
                name="max_apogee_date"
                type="date"
                value={formData.max_apogee_date}
                onChange={handleChange}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 1 }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Comments & Photo */}
        <Paper elevation={1} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
          <Grid container spacing={3}>
            <Grid item xs= xs: 12 }}>
              <HelpLabel 
                label="Commentaires & Notes"
                helpTitle="Notes de dégustation"
                helpDescription="Notez vos impressions, goûts détectés, recommandations d'accords mets-produits, etc."
              />
              <TextField
                fullWidth
                name="comments"
                value={formData.comments}
                onChange={handleChange}
                multiline
                rows={4}
                placeholder="Impressions de dégustation, recommandations, etc."
                size="small"
                sx={{ mt: 1 }}
              />
            </Grid>

            <Grid item xs= xs: 12 }}>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ color: theme.palette.onSurfaceVariant, fontWeight: 600 }}>
                  Photo de l'étiquette
                </Typography>
                <HelpIcon 
                  title="Photo / Code-barres"
                  description="Téléchargez une photo de l'étiquette ou scannez le code-barres (EAN) pour identification automatique."
                />
              </Box>
              <Button variant="outlined" component="label" size="small" disabled>
                📷 Télécharger une photo (prochainement)
                <input type="file" hidden accept="image/*" />
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {/* Actions */}
        <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
          <Stack direction={{ xs: 'column' sm= 'row' }} spacing={2} justifyContent="flex-end">
            <Button
              variant="outlined"
              onClick={onClose}
              disabled={loading}
              fullWidth={{ xs: true sm= false }}
            >
              Annuler
            </Button>
            <Button
              variant="outlined"
              onClick={(e) => handleSubmit(e, true)}
              disabled={loading}
              fullWidth={{ xs: true sm= false }}
            >
              {loading ? 'Création...' : 'Enregistrer et ajouter un autre'}
            </Button>
            <Button
              variant="contained"
              onClick={(e) => handleSubmit(e, false)}
              disabled={loading}
              fullWidth={{ xs: true sm= false }}
            >
              {loading ? 'Création...' : 'Créer'}
            </Button>
          </Stack>
        </Paper>
      </form>
    </Box>
  );
};

export default WineCreateForm;



