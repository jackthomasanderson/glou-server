import React from 'react';
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
  IconButton,
  Menu,
  MenuItem,
  CardActionArea,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { useState } from 'react';

/**
 * Wine Card - Summary view of wine for list display
 * Shows key information: Name, Type, Vintage, Stock, Rating, Apogee Status
 */
export const WineCard = ({ wine, onView, onEdit, onDelete }) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);

  // Determine apogee status
  const getApogeeStatus = () => {
    if (!wine.min_apogee_date || !wine.max_apogee_date) return 'unknown';
    const today = new Date();
    const minDate = new Date(wine.min_apogee_date);
    const maxDate = new Date(wine.max_apogee_date);

    if (today < minDate) return 'pending';
    if (today > maxDate) return 'expired';
    return 'ready';
  };

  const apogeeStatus = getApogeeStatus();

  const getApogeeChip = () => {
    switch (apogeeStatus) {
      case 'ready':
        return (
          <Chip
            label="À boire"
            size="small"
            color="success"
            variant="filled"
          />
        );
      case 'pending':
        return (
          <Chip
            label="Pas encore"
            size="small"
            variant="outlined"
            color="info"
          />
        );
      case 'expired':
        return (
          <Chip
            label="Passé l'apogée"
            size="small"
            variant="filled"
            color="error"
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card
      sx={{
        backgroundColor: theme.palette.surfaceMedium,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '12px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          backgroundColor: theme.palette.surfaceDark,
          boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.08)}`,
          transform: 'translateY(-2px)',
        },
      }}
    >
      {/* Card Header with Menu */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          p: 2,
        }}
      >
        <Box flex={1}>
          <Typography
            variant="titleMedium"
            sx={{
              color: theme.palette.onSurface,
              fontWeight: 600,
              mb: 0.5,
            }}
          >
            {wine.name}
          </Typography>
          <Typography
            variant="bodySmall"
            sx={{
              color: theme.palette.onSurfaceVariant,
            }}
          >
            {wine.producer}
          </Typography>
        </Box>

        {/* Menu Button */}
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            color: theme.palette.onSurfaceVariant,
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>

        {/* Dropdown Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem
            onClick={() => {
              onView(wine.id);
              setAnchorEl(null);
            }}
          >
            <OpenIcon fontSize="small" sx={{ mr: 1 }} />
            Détails
          </MenuItem>
          <MenuItem
            onClick={() => {
              onEdit(wine.id);
              setAnchorEl(null);
            }}
          >
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Modifier
          </MenuItem>
          <MenuItem
            onClick={() => {
              onDelete(wine.id);
              setAnchorEl(null);
            }}
            sx={{ color: theme.palette.error.main }}
          >
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            Supprimer
          </MenuItem>
        </Menu>
      </Box>

      {/* Card Content */}
      <CardContent
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {/* Vintage & Type Chips */}
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            label={`${wine.vintage}`}
            size="small"
            variant="outlined"
            sx={{
              borderColor: theme.palette.primary.main,
              color: theme.palette.primary.main,
            }}
          />
          <Chip
            label={wine.type}
            size="small"
            color="primary"
            variant="filled"
          />
          {wine.region && (
            <Chip label={wine.region} size="small" variant="outlined" />
          )}
        </Stack>

        {/* Stock Information */}
        <Box sx={{ p: 1, backgroundColor: alpha(theme.palette.primary.main, 0.05), borderRadius: '8px' }}>
          <Typography
            variant="labelSmall"
            sx={{
              color: theme.palette.onSurfaceVariant,
              textTransform: 'uppercase',
            }}
          >
            Stock
          </Typography>
          <Typography
            variant="displaySmall"
            sx={{
              color: theme.palette.primary.main,
              fontWeight: 600,
              fontSize: '1.5rem',
            }}
          >
            {wine.quantity || 0}
          </Typography>
          {wine.consumed > 0 && (
            <Typography
              variant="bodySmall"
              sx={{
                color: theme.palette.onSurfaceVariant,
              }}
            >
              {wine.consumed} consommées
            </Typography>
          )}
        </Box>

        {/* Rating & Price */}
        <Stack direction="row" spacing={1} justifyContent="space-between">
          {wine.rating && (
            <Box>
              <Typography
                variant="labelSmall"
                sx={{
                  color: theme.palette.onSurfaceVariant,
                  textTransform: 'uppercase',
                }}
              >
                Note
              </Typography>
              <Stack direction="row" spacing={0.25}>
                {[...Array(5)].map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      fontSize: '1.2rem',
                      color: i < Math.round(wine.rating)
                        ? theme.palette.tertiary
                        : theme.palette.divider,
                    }}
                  >
                    ★
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          {wine.price && (
            <Box>
              <Typography
                variant="labelSmall"
                sx={{
                  color: theme.palette.onSurfaceVariant,
                  textTransform: 'uppercase',
                }}
              >
                Prix
              </Typography>
              <Typography
                variant="bodyMedium"
                sx={{
                  color: theme.palette.onSurface,
                  fontWeight: 600,
                }}
              >
                {wine.price}€
              </Typography>
            </Box>
          )}
        </Stack>

        {/* Apogee Status */}
        <Box sx={{ pt: 1 }}>
          {getApogeeChip()}
        </Box>
      </CardContent>
    </Card>
  );
};

/**
 * Wine Grid - Display collection of wines as cards
 */
export const WineGrid = ({ wines = [], loading = false, onView, onEdit, onDelete }) => {
  const theme = useTheme();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <Typography>Chargement...</Typography>
      </Box>
    );
  }

  if (wines.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="titleMedium" sx={{ color: theme.palette.onSurfaceVariant }}>
          Aucune bouteille
        </Typography>
        <Typography variant="bodySmall" sx={{ color: theme.palette.onSurfaceVariant }}>
          Commencez par ajouter une bouteille à votre cave
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {wines.map((wine) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={wine.id}>
          <WineCard
            wine={wine}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default WineCard;
