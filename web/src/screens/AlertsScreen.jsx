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
import { useAlerts } from '../hooks/useApi';

/**
 * Alerts Screen - Display and manage wine alerts
 */
export const AlertsScreen = () => {
  const theme = useTheme();
  const { alerts, loading, error, dismissAlert } = useAlerts();

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
          {alerts.length} alerte{alerts.length !== 1 ? 's' : ''} actives
        </Typography>
      </Box>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Alerts Table */}
      {!loading && (
        <TableContainer
          component={Card}
          sx={{
            backgroundColor: theme.palette.surfaceMedium,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
          }}
        >
          {alerts.length === 0 ? (
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
          ) : (
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
          )}
        </TableContainer>
      )}
    </Box>
  );
};

export default AlertsScreen;
