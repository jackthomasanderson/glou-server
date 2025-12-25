import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActions,
  Grid,
  Typography,
  Button,
  Stack,
  Chip,
  useTheme,
  alpha,
  IconButton,
  Dialog,
  TextField,
} from '@mui/material';
import {
  Add as AddIcon,
  PhotoCamera as CameraIcon,
  QrCode as QrCodeIcon,
  LocalDrink as WineIcon,
  WarningAmber as AlertIcon,
  TrendingUp as TrendingUpIcon,
  Favorite as FavoriteIcon,
} from '@mui/icons-material';
import { Link } from 'react-router-dom';

/**
 * CollectionDashboard - Clean, Modern Personal Collection Dashboard
 * Enhanced UI with:
 * - Refined card designs with subtle shadows
 * - Better visual hierarchy
 * - Improved typography
 * - Optimized spacing and layout
 * - Ready to drink alerts
 * - Peak drinking notes
 * - Recent tastings
 * - Quick add actions (camera/barcode/manual)
 */
export const CollectionDashboard = ({ wines = [], tastings = [], peakAlerts = [] }) => {
  const theme = useTheme();
  const userLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  const isFr = userLang.startsWith('fr');
  const t = (fr, en) => (isFr ? fr : en);

  const quickAddOptions = [
    { id: 'camera', label: t('Photographier', 'Camera'), icon: <CameraIcon />, path: '/add' },
    { id: 'barcode', label: t('Scan Code-barres', 'Barcode'), icon: <QrCodeIcon />, path: '/add' },
    { id: 'manual', label: t('Ajouter manuellement', 'Manual Add'), icon: <AddIcon />, path: '/bottles/add' },
  ];

  const readyToDrink = wines.filter(w => w.isReadyToDrink).slice(0, 3);
  const recentTastings = tastings.slice(0, 3);

  return (
    <Box sx={{ padding: 3 }}>
      {/* Welcome Section */}
      <Box sx={{ marginBottom: 4 }}>
        <Typography variant="h4" sx={{ color: theme.palette.onSurface, marginBottom: 1, fontWeight: 600 }}>
          {t('Bienvenue dans votre cave', 'Welcome to Your Collection')}
        </Typography>
        <Typography variant="body1" sx={{ color: theme.palette.onSurfaceVariant }}>
          {t('Gérez et découvrez votre collection de vins et de tabacs avec passion.', 'Manage and explore your wine and tobacco collection with passion.')}
        </Typography>
      </Box>

      {/* Quick Add Actions */}
      <Card sx={{ 
        marginBottom: 4,
        backgroundColor: alpha(theme.palette.primary.main, 0.06),
        border: `1.5px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        borderRadius: '16px',
        boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.08)}`,
      }}>
        <CardContent sx={{ paddingY: 3 }}>
          <Typography variant="h6" sx={{ marginBottom: 2.5, color: theme.palette.onSurface, fontWeight: 600 }}>
            {t('Ajouter à votre collection', 'Add to Collection')}
          </Typography>
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
            {quickAddOptions.map(option => (
              <Button
                key={option.id}
                variant="contained"
                startIcon={option.icon}
                component={Link}
                to={option.path}
                sx={{
                  backgroundColor: theme.palette.primary.main,
                  color: theme.palette.onPrimary,
                  textTransform: 'none',
                  borderRadius: '12px',
                  flex: '1 1 auto',
                  minWidth: '140px',
                  padding: '10px 20px',
                  fontWeight: 600,
                  boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.25)}`,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    backgroundColor: theme.palette.primaryContainer,
                    color: theme.palette.onPrimaryContainer,
                    boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.35)}`,
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                {option.label}
              </Button>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {/* Main Stats Grid */}
      <Grid container spacing={3} sx={{ marginBottom: 4 }}>
        {/* Ready to Drink - Highlight */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            backgroundColor: theme.palette.surface,
            border: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
            borderRadius: '16px',
            height: '100%',
            boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: `0 4px 16px ${alpha(theme.palette.onSurface, 0.1)}`,
              transform: 'translateY(-2px)',
            },
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <Typography variant="subtitle1" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
                  {t('À boire', 'Ready to Drink')}
                </Typography>
                <Box sx={{
                  backgroundColor: alpha(theme.palette.tertiary.main, 0.15),
                  borderRadius: '12px',
                  padding: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <WineIcon sx={{ color: theme.palette.tertiary.main, fontSize: 24 }} />
                </Box>
              </Box>
              <Typography variant="h3" sx={{ color: theme.palette.onSurface, fontWeight: 700, marginBottom: 1 }}>
                {readyToDrink.length}
              </Typography>
              <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
                {t('bouteilles prêtes', 'bottles available')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Peak Alerts */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            backgroundColor: theme.palette.surface,
            border: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
            borderRadius: '16px',
            height: '100%',
            boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: `0 4px 16px ${alpha(theme.palette.onSurface, 0.1)}`,
              transform: 'translateY(-2px)',
            },
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <Typography variant="subtitle1" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
                  {t('À l\'apogée', 'At Peak')}
                </Typography>
                <Box sx={{
                  backgroundColor: alpha(theme.palette.warning.main, 0.15),
                  borderRadius: '12px',
                  padding: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <AlertIcon sx={{ color: theme.palette.warning.main, fontSize: 24 }} />
                </Box>
              </Box>
              <Typography variant="h3" sx={{ color: theme.palette.onSurface, fontWeight: 700, marginBottom: 1 }}>
                {peakAlerts.length}
              </Typography>
              <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
                {t('à surveiller', 'to watch')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Collection Size */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            backgroundColor: theme.palette.surface,
            border: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
            borderRadius: '16px',
            height: '100%',
            boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: `0 4px 16px ${alpha(theme.palette.onSurface, 0.1)}`,
              transform: 'translateY(-2px)',
            },
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <Typography variant="subtitle1" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
                  {t('Inventaire', 'Inventory')}
                </Typography>
                <Box sx={{
                  backgroundColor: alpha(theme.palette.primary.main, 0.15),
                  borderRadius: '12px',
                  padding: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <TrendingUpIcon sx={{ color: theme.palette.primary.main, fontSize: 24 }} />
                </Box>
              </Box>
              <Typography variant="h3" sx={{ color: theme.palette.onSurface, fontWeight: 700, marginBottom: 1 }}>
                {wines.length}
              </Typography>
              <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
                {t('bouteilles au total', 'bottles total')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Tastings */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            backgroundColor: theme.palette.surface,
            border: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
            borderRadius: '16px',
            height: '100%',
            boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`,
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: `0 4px 16px ${alpha(theme.palette.onSurface, 0.1)}`,
              transform: 'translateY(-2px)',
            },
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <Typography variant="subtitle1" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
                  {t('Dégustations', 'Tastings')}
                </Typography>
                <Box sx={{
                  backgroundColor: alpha(theme.palette.secondary.main, 0.15),
                  borderRadius: '12px',
                  padding: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <FavoriteIcon sx={{ color: theme.palette.secondary.main, fontSize: 24 }} />
                </Box>
              </Box>
              <Typography variant="h3" sx={{ color: theme.palette.onSurface, fontWeight: 700, marginBottom: 1 }}>
                {recentTastings.length}
              </Typography>
              <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
                {t('dégustations récentes', 'recent tastings')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Ready to Drink Section */}
      {readyToDrink.length > 0 && (
        <Box sx={{ marginBottom: 4 }}>
          <Typography variant="h6" sx={{ color: theme.palette.onSurface, marginBottom: 2, fontWeight: 600 }}>
            {t('À boire très bientôt', 'Ready to Drink Soon')}
          </Typography>
          <Grid container spacing={2}>
            {readyToDrink.map(wine => (
              <Grid item xs={12} sm={6} md={4} key={wine.id}>
                <WineCardPreview wine={wine} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Recent Tastings Section */}
      {recentTastings.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ color: theme.palette.onSurface, marginBottom: 2, fontWeight: 600 }}>
            {t('Mes dernières dégustations', 'Recent Tastings')}
          </Typography>
          <Grid container spacing={2}>
            {recentTastings.map(tasting => (
              <Grid item xs={12} key={tasting.id}>
                <TastingCard tasting={tasting} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

/**
 * WineCardPreview - Clean preview of a wine ready to drink
 */
const WineCardPreview = ({ wine }) => {
  const theme = useTheme();
  const userLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  const isFr = userLang.startsWith('fr');
  const t = (fr, en) => (isFr ? fr : en);

  return (
    <Card sx={{
      backgroundColor: theme.palette.surface,
      border: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
      borderRadius: '16px',
      transition: 'all 0.3s ease',
      boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`,
      '&:hover': {
        boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.15)}`,
        transform: 'translateY(-2px)',
        borderColor: alpha(theme.palette.primary.main, 0.3),
      },
    }}>
      <CardContent>
        <Typography variant="h6" sx={{ color: theme.palette.onSurface, fontWeight: 600, marginBottom: 1 }}>
          {wine.name}
        </Typography>
        <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
          {wine.region} • {wine.vintage}
        </Typography>
        {wine.notes && (
          <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant, marginTop: 1.5, lineHeight: 1.6 }}>
            {wine.notes.substring(0, 60)}...
          </Typography>
        )}
      </CardContent>
      <CardActions sx={{ paddingTop: 0 }}>
        <Button size="small" component={Link} to={`/wines/${wine.id}`} sx={{ fontWeight: 600 }}>
          {t('Voir les détails', 'View Details')}
        </Button>
      </CardActions>
    </Card>
  );
};

/**
 * TastingCard - Recent tasting entry with improved styling
 */
const TastingCard = ({ tasting }) => {
  const theme = useTheme();

  return (
    <Card sx={{
      backgroundColor: theme.palette.surface,
      border: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
      borderRadius: '16px',
      transition: 'all 0.3s ease',
      boxShadow: `0 2px 8px ${alpha(theme.palette.onSurface, 0.05)}`,
      '&:hover': {
        boxShadow: `0 4px 16px ${alpha(theme.palette.onSurface, 0.1)}`,
      },
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ color: theme.palette.onSurface, fontWeight: 600, marginBottom: 0.5 }}>
              {tasting.wineName}
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
              {new Date(tasting.date).toLocaleDateString()}
            </Typography>
            {tasting.rating && (
              <Box sx={{ marginTop: 1 }}>
                <Chip
                  label={`★ ${tasting.rating}/5`}
                  size="small"
                  sx={{ 
                    backgroundColor: alpha(theme.palette.warning.main, 0.15),
                    fontWeight: 600,
                  }}
                />
              </Box>
            )}
          </Box>
          {tasting.notes && (
            <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant, fontStyle: 'italic', flex: 1, textAlign: 'right' }}>
              "{tasting.notes.substring(0, 50)}..."
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default CollectionDashboard;
