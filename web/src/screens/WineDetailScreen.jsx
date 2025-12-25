import React, { useState } from 'react';
import api from '../services/apiClient';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  useTheme,
  alpha,
  Chip,
  Stack,
  Divider,
  Rating,
  Button,
  Dialog,
  TextField,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  LocalFireDepartment as FireIcon,
  DateRange as CalendarIcon,
  LocalDrink as DrinkIcon,
  Place as PlaceIcon,
  Person as PersonIcon,
  AttachMoney as MoneyIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

/**
 * Wine Detail Screen - Comprehensive Wine Bottle View
 * Displays all wine information organized in MD3-compliant sections
 */
export const WineDetailScreen = ({ wineId, wine: initialWine, onUpdate, onDelete }) => {
  const theme = useTheme();
  const [wine, setWine] = useState(initialWine || {});
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState({});

  // Format date for display
  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Check if wine is in apogee window
  const isInApogee = () => {
    if (!wine.min_apogee_date || !wine.max_apogee_date) return null;
    const today = new Date();
    const minDate = new Date(wine.min_apogee_date);
    const maxDate = new Date(wine.max_apogee_date);
    return today >= minDate && today <= maxDate;
  };

  const apogeeStatus = isInApogee();

  return (
    <Box sx={{ p: 3 }}>
      {/* Header Section */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h3" sx={{ color: theme.palette.onSurface, mb: 1 }}>
            {wine.name}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip label={wine.type || 'Type inconnu'} variant="outlined" size="small" />
            <Chip label={`Millésime ${wine.vintage}`} color="primary" size="small" />
            {(() => {
              const now = new Date();
              const min = wine.min_apogee_date ? new Date(wine.min_apogee_date) : null;
              const max = wine.max_apogee_date ? new Date(wine.max_apogee_date) : null;
              let label = 'Maturité'; let color = 'default'; let variant = 'outlined';
              if (min && now < min) { label = 'En garde'; color = 'info'; variant = 'filled'; }
              else if (min && (!max || (now >= min && now <= max))) { label = 'À boire - Apogée'; color = 'warning'; variant = 'filled'; }
              else if (max && now > max) { label = 'Déclin'; color = 'error'; variant = 'filled'; }
              return <Chip label={label} color={color} size="small" variant={variant} />;
            })()}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<EditIcon />}
            variant="outlined"
            onClick={() => {
              setEditData(wine);
              setIsEditOpen(true);
            }}
          >
            Modifier
          </Button>
          <Button
            startIcon={<DeleteIcon />}
            variant="outlined"
            color="error"
            onClick={() => onDelete(wineId)}
          >
            Supprimer
          </Button>
        </Stack>
      </Box>

      <Grid container spacing={3}>
        {/* Identification Section */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography
                variant="titleLarge"
                sx={{ mb: 2, color: theme.palette.onSurface }}
              >
                📋 Identification
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                {/* Producteur */}
                <Box>
                  <Typography
                    variant="labelMedium"
                    sx={{ color: theme.palette.onSurfaceVariant }}
                  >
                    Producteur
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <PersonIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                    <Typography sx={{ color: theme.palette.onSurface }}>
                      {wine.producer || '-'}
                    </Typography>
                  </Box>
                </Box>

                {/* Region */}
                <Box>
                  <Typography
                    variant="labelMedium"
                    sx={{ color: theme.palette.onSurfaceVariant }}
                  >
                    Région / Appellation
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <PlaceIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                    <Typography sx={{ color: theme.palette.onSurface }}>
                      {wine.region || '-'}
                    </Typography>
                  </Box>
                </Box>

                {/* Alcohol Level */}
                <Box>
                  <Typography
                    variant="labelMedium"
                    sx={{ color: theme.palette.onSurfaceVariant }}
                  >
                    Degré Alcoolique
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <FireIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                    <Typography sx={{ color: theme.palette.onSurface }}>
                      {wine.alcohol_level ? `${wine.alcohol_level}°` : '-'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Stock Section */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography
                variant="titleLarge"
                sx={{ mb: 2, color: theme.palette.onSurface }}
              >
                🍾 Stock
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                {/* Quantity */}
                <Box>
                  <Typography variant="labelMedium" sx={{ color: theme.palette.onSurfaceVariant }}>
                    Bouteilles en cave
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography variant="displaySmall" sx={{ color: theme.palette.primary.main, fontWeight: 600, fontSize: '2rem' }}>
                      {wine.quantity || 0}
                    </Typography>
                    <Typography variant="bodyMedium" sx={{ color: theme.palette.onSurfaceVariant }}>
                      / {wine.consumed || 0} consommées
                    </Typography>
                    <Button size="small" variant="outlined" onClick={async () => {
                      await api.deleteWine(wine.id);
                      const q = Math.max((wine.quantity || 1) - 1, 0);
                      const updated = { ...wine, quantity: q };
                      setWine(updated);
                      if (onUpdate) onUpdate(updated);
                    }}>-</Button>
                    <Button size="small" variant="contained" onClick={async () => {
                      const updated = { ...wine, quantity: (wine.quantity || 0) + 1 };
                      await api.updateWine(wine.id, updated);
                      setWine(updated);
                      if (onUpdate) onUpdate(updated);
                    }}>+</Button>
                  </Box>
                </Box>

                {/* Location */}
                {wine.cell_id && (
                  <Box>
                    <Typography
                      variant="labelMedium"
                      sx={{ color: theme.palette.onSurfaceVariant }}
                    >
                      Emplacement
                    </Typography>
                    <Typography sx={{ color: theme.palette.onSurface, mt: 0.5 }}>
                      Cellule #{wine.cell_id}
                    </Typography>
                  </Box>
                )}

                {/* Last Consumption Date */}
                {wine.consumption_date && (
                  <Box>
                    <Typography
                      variant="labelMedium"
                      sx={{ color: theme.palette.onSurfaceVariant }}
                    >
                      Dernière dégustation
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <CalendarIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                      <Typography sx={{ color: theme.palette.onSurface }}>
                        {formatDate(wine.consumption_date)}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Apogee Window Section */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography
                  variant="titleLarge"
                  sx={{ color: theme.palette.onSurface }}
                >
                  ⏰ Fenêtre d'Apogée
                </Typography>
                {apogeeStatus === true && (
                  <Chip label="À boire maintenant!" color="success" size="small" />
                )}
                {apogeeStatus === false && (
                  <Chip
                    label="Hors de l'apogée"
                    variant="outlined"
                    size="small"
                  />
                )}
              </Box>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                {/* Min Apogee Date */}
                <Box>
                  <Typography
                    variant="labelMedium"
                    sx={{ color: theme.palette.onSurfaceVariant }}
                  >
                    À boire à partir du
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <CalendarIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                    <Typography sx={{ color: theme.palette.onSurface }}>
                      {formatDate(wine.min_apogee_date)}
                    </Typography>
                  </Box>
                </Box>

                {/* Max Apogee Date */}
                <Box>
                  <Typography
                    variant="labelMedium"
                    sx={{ color: theme.palette.onSurfaceVariant }}
                  >
                    À boire jusqu'au
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <CalendarIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                    <Typography sx={{ color: theme.palette.onSurface }}>
                      {formatDate(wine.max_apogee_date)}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Evaluation Section */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography
                variant="titleLarge"
                sx={{ mb: 2, color: theme.palette.onSurface }}
              >
                ⭐ Évaluation
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                {/* Rating */}
                <Box>
                  <Typography
                    variant="labelMedium"
                    sx={{ color: theme.palette.onSurfaceVariant }}
                  >
                    Note
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    {wine.rating ? (
                      <Rating value={wine.rating / 1} readOnly />
                    ) : (
                      <Typography sx={{ color: theme.palette.onSurfaceVariant }}>
                        Non notée
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Price */}
                <Box>
                  <Typography
                    variant="labelMedium"
                    sx={{ color: theme.palette.onSurfaceVariant }}
                  >
                    Prix d'achat
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <MoneyIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                    <Typography sx={{ color: theme.palette.onSurface }}>
                      {wine.price ? `${wine.price}€` : '-'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Comments Section */}
        <Grid item xs={12}>
          <Card
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <CardContent>
              <Typography
                variant="titleLarge"
                sx={{ mb: 2, color: theme.palette.onSurface }}
              >
                💬 Commentaires & Notes
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Typography
                sx={{
                  color: theme.palette.onSurface,
                  p: 2,
                  backgroundColor: alpha(theme.palette.primary.main, 0.05),
                  borderRadius: '8px',
                  minHeight: '100px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {wine.comments || 'Aucun commentaire'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Edit Dialog */}
      <WineEditDialog
        open={isEditOpen}
        wine={editData}
        onClose={() => setIsEditOpen(false)}
        onSave={(updatedWine) => {
          setWine(updatedWine);
          onUpdate(updatedWine);
          setIsEditOpen(false);
        }}
      />
    </Box>
  );
};

/**
 * Edit Dialog for Wine Details
 */
const WineEditDialog = ({ open, wine, onClose, onSave }) => {
  const theme = useTheme();
  const [data, setData] = useState(wine);

  const handleSave = () => {
    onSave(data);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Modifier les informations
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Nom"
            value={data.name || ''}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Région"
            value={data.region || ''}
            onChange={(e) => setData({ ...data, region: e.target.value })}
            fullWidth
          />
          <TextField
            label="Producteur"
            value={data.producer || ''}
            onChange={(e) => setData({ ...data, producer: e.target.value })}
            fullWidth
          />
          <TextField
            label="Commentaires"
            value={data.comments || ''}
            onChange={(e) => setData({ ...data, comments: e.target.value })}
            multiline
            rows={4}
            fullWidth
          />
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="contained" onClick={handleSave}>
              Sauvegarder
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Dialog>
  );
};

export default WineDetailScreen;
