import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  useTheme,
  Button,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useAlerts, useTobaccoAlerts } from '../hooks/useApi';

/**
 * Alerts Screen - Display and manage wine and tobacco alerts
 */
export const AlertsScreen = () => {
  const theme = useTheme();
  const { alerts, loading, error, dismissAlert } = useAlerts();
  const { 
    alerts: tobaccoAlerts, 
    loading: tobaccoLoading, 
    error: tobaccoError, 
    dismissAlert: dismissTobaccoAlert,
    generateAlerts: generateTobaccoAlerts 
  } = useTobaccoAlerts();

  const totalAlerts = (alerts?.length || 0) + (tobaccoAlerts?.length || 0);

  const getAlertColor = (type) => {
    switch (type) {
      case 'low_stock':
        return 'warning';
      case 'apogee_reached':
        return 'success';
      case 'apogee_ended':
        return 'error';
      default:
        return 'info';
    }
  };

  const getAlertLabel = (type) => {
    switch (type) {
      case 'low_stock':
        return 'Stock faible';
      case 'apogee_reached':
        return 'À boire maintenant';
      case 'apogee_ended':
        return 'Apogée dépassée';
      default:
        return 'Alerte';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: theme.palette.onSurface, mb: 1 }}>
          🔔 Alertes
        </Typography>
        <Typography variant="bodySmall" sx={{ color: theme.palette.onSurfaceVariant }}>
          {totalAlerts} alerte{totalAlerts !== 1 ? 's' : ''} actives ({alerts?.length || 0} vins, {tobaccoAlerts?.length || 0} tabacs)
        </Typography>
        <Button
          variant="outlined"
          sx={{ mt: 2 }}
          onClick={async () => {
            try {
              await generateTobaccoAlerts();
            } catch (err) {
              console.error('Error generating tobacco alerts:', err);
            }
          }}
        >
          Générer alertes tabac
        </Button>
      </Box>

      {/* Error Message */}
      {(error || tobaccoError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || tobaccoError}
        </Alert>
      )}

      {/* Loading State */}
      {(loading || tobaccoLoading) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Wine Alerts Table */}
      {!loading && alerts && alerts.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, color: theme.palette.onSurface }}>
            Alertes Vins
          </Typography>
          <TableContainer
            component={Card}
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.surfaceContainer }}>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Vin ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow
                    key={alert.id}
                    sx={{
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                    }}
                  >
                    <TableCell>
                      <Chip
                        label={getAlertLabel(alert.alert_type)}
                        color={getAlertColor(alert.alert_type)}
                        size="small"
                        variant="filled"
                      />
                    </TableCell>
                    <TableCell>{alert.wine_id}</TableCell>
                    <TableCell>
                      {new Date(alert.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<DeleteIcon />}
                        color="error"
                        onClick={async () => {
                          if (window.confirm('Fermer cette alerte?')) {
                            await dismissAlert(alert.id);
                          }
                        }}
                      >
                        Fermer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Tobacco Alerts Table */}
      {!tobaccoLoading && tobaccoAlerts && tobaccoAlerts.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, color: theme.palette.onSurface }}>
            Alertes Tabac
          </Typography>
          <TableContainer
            component={Card}
            sx={{
              backgroundColor: theme.palette.surfaceMedium,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '12px',
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.surfaceContainer }}>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Tabac ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tobaccoAlerts.map((alert) => (
                  <TableRow
                    key={alert.id}
                    sx={{
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                    }}
                  >
                    <TableCell>
                      <Chip
                        label="Stock faible"
                        color="warning"
                        size="small"
                        variant="filled"
                      />
                    </TableCell>
                    <TableCell>{alert.tobacco_id}</TableCell>
                    <TableCell>
                      {new Date(alert.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<DeleteIcon />}
                        color="error"
                        onClick={async () => {
                          if (window.confirm('Fermer cette alerte?')) {
                            await dismissTobaccoAlert(alert.id);
                          }
                        }}
                      >
                        Fermer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* No Alerts Message */}
      {!loading && !tobaccoLoading && totalAlerts === 0 && (
        <Card
          sx={{
            backgroundColor: theme.palette.surfaceMedium,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
          }}
        >
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <WarningIcon
              sx={{
                fontSize: 48,
                color: theme.palette.onSurfaceVariant,
                mb: 1,
              }}
            />
            <Typography sx={{ color: theme.palette.onSurfaceVariant }}>
              Aucune alerte active
            </Typography>
          </Box>
        </Card>
      )}
    </Box>
  );
};

export default AlertsScreen;
