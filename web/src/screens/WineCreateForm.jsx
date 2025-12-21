import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Grid,
  Typography,
  useTheme,
  Stack,
  Alert,
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
  const [formData, setFormData] = useState({
    name: '',
    producer: '',
    region: '',
    vintage: new Date().getFullYear(),
    type: 'Red',
    quantity: 1,
    alcohol_level: 12.5,
    price: 0,
    rating: 0,
    min_apogee_date: '',
    max_apogee_date: '',
    comments: '',
  });

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ color: theme.palette.onSurface }}>
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  color: theme.palette.onSurfaceVariant,
                }}
              >
                Informations obligatoires
              </Typography>
              <HelpIcon 
                title="Champs obligatoires"
                description="Ces champs doivent être remplis pour enregistrer une bouteille."
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
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

          <Grid item xs={12} sm={6}>
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

          <Grid item xs={12} sm={6}>
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

          <Grid item xs={12} sm={3}>
            <HelpLabel 
              label="Millésime"
              helpTitle="Année du millésime"
              helpDescription="L'année de récolte de la bouteille. Doit être entre 1900 et l'année actuelle."
            />
            <TextField
              fullWidth
              type="number"
              value={formData.vintage}
              onChange={handleChange}
              inputProps={{ min: 1900, max: new Date().getFullYear() }}
              size="small"
              sx={{ mt: 1 }}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <HelpLabel 
              label="Type"
              helpTitle="Type de boisson"
              helpDescription="Catégorie: Rouge, Blanc, Rosé ou Pétillant."
            />
            <TextField
              fullWidth
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

          {/* Stock Section */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  color: theme.palette.onSurfaceVariant,
                }}
              >
                Stock
              </Typography>
              <HelpIcon 
                title="Gestion du stock"
                description="Entrez la quantité de bouteilles disponibles dans votre cave."
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <HelpLabel 
              label="Quantité"
              helpTitle="Nombre de bouteilles"
              helpDescription="Nombre de bouteilles de ce produit disponibles."
            />
            <TextField
              fullWidth
              type="number"
              value={formData.quantity}
              onChange={handleChange}
              inputProps={{ min: 1 }}
              size="small"
              sx={{ mt: 1 }}
            />
          </Grid>

          {/* Characteristics Section */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  color: theme.palette.onSurfaceVariant,
                }}
              >
                Caractéristiques
              </Typography>
              <HelpIcon 
                title="Caractéristiques du produit"
                description="Informations supplémentaires pour qualifier et évaluer la bouteille."
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <HelpLabel 
              label="Degré alcoolique"
              helpTitle="Alcool %"
              helpDescription="Pourcentage d'alcool, généralement entre 7% et 15%. Trouvez cette information sur l'étiquette."
            />
            <TextField
              fullWidth
              type="number"
              value={formData.alcohol_level}
              onChange={handleChange}
              inputProps={{ min: 0, max: 20, step: 0.5 }}
              size="small"
              helperText="Entre 0 et 20%"
              sx={{ mt: 1 }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <HelpLabel 
              label="Prix d'achat (€)"
              helpTitle="Prix d'acquisition"
              helpDescription="Montant payé pour l'achat de cette bouteille. Utile pour suivre la valeur de votre collection."
            />
            <TextField
              fullWidth
              type="number"
              value={formData.price}
              onChange={handleChange}
              inputProps={{ min: 0 }}
              size="small"
              sx={{ mt: 1 }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <HelpLabel 
              label="Note de dégustation"
              helpTitle="Évaluation personnelle"
              helpDescription="Votre note personnelle sur 5 étoiles. 0 = non goûté, 5 = excellent."
            />
            <TextField
              fullWidth
              type="number"
              value={formData.rating}
              onChange={handleChange}
              inputProps={{ min: 0, max: 5, step: 0.5 }}
              size="small"
              helperText="Entre 0 et 5"
              sx={{ mt: 1 }}
            />
          </Grid>

          {/* Apogee Section */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  color: theme.palette.onSurfaceVariant,
                }}
              >
                Fenêtre d'apogée
              </Typography>
              <HelpIcon 
                title="Fenêtre d'apogée"
                description="Période optimale pour déguster cette bouteille. L'application vous avertira lorsque la bouteille atteindra ou dépassera son apogée."
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <HelpLabel 
              label="À boire à partir du"
              helpTitle="Date minimale d'apogée"
              helpDescription="Date à partir de laquelle le produit sera à boire. Avant cette date, il peut ne pas être à son meilleur."
            />
            <TextField
              fullWidth
              type="date"
              value={formData.min_apogee_date}
              onChange={handleChange}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 1 }}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <HelpLabel 
              label="À boire jusqu'au"
              helpTitle="Date maximale d'apogée"
              helpDescription="Date limite pour déguster la bouteille à son meilleur. Après cette date, le produit peut se dégrader."
            />
            <TextField
              fullWidth
              type="date"
              value={formData.max_apogee_date}
              onChange={handleChange}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 1 }}
            />
          </Grid>

          {/* Comments */}
          <Grid item xs={12}>
            <HelpLabel 
              label="Commentaires & Notes"
              helpTitle="Notes de dégustation"
              helpDescription="Notez vos impressions, goûts détectés, recommandations d'accords mets-produits, etc."
            />
            <TextField
              fullWidth
              value={formData.comments}
              onChange={handleChange}
              multiline
              rows={3}
              placeholder="Impressions de dégustation, recommandations, etc."
              size="small"
              sx={{ mt: 1 }}
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
                {loading ? 'Création...' : 'Créer'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default WineCreateForm;
