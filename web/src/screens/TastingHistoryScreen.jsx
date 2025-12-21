import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Dialog,
  TextField,
  Typography,
  useTheme,
  Button,
  Stack,
  Grid,
  Rating,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useTastingHistory } from '../hooks/useApi';

/**
 * Tasting History Screen - Record and display wine tastings
 */
export const TastingHistoryScreen = ({ wineId }) => {
  const theme = useTheme();
  const { history, loading, error, recordTasting } = useTastingHistory(wineId);
  const [showForm, setShowForm] = useState(false);

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
        <Box>
          <Typography variant="h5" sx={{ color: theme.palette.onSurface }}>
            🍷 Historique de dégustation
          </Typography>
          <Typography variant="bodySmall" sx={{ color: theme.palette.onSurfaceVariant }}>
            {history.length} dégustation{history.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => setShowForm(true)}
        >
          Ajouter dégustation
        </Button>
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

      {/* History Table */}
      {!loading && (
        <TableContainer
          component={Card}
          sx={{
            backgroundColor: theme.palette.surfaceMedium,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
          }}
        >
          {history.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography sx={{ color: theme.palette.onSurfaceVariant, mb: 2 }}>
                Aucune dégustation enregistrée
              </Typography>
              <Button
                variant="outlined"
                onClick={() => setShowForm(true)}
              >
                Enregistrer la première dégustation
              </Button>
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: theme.palette.surfaceContainer }}>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Quantité</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Raison</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Note</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Commentaire</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((record) => (
                  <TableRow
                    key={record.id}
                    sx={{
                      '&:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                    }}
                  >
                    <TableCell>
                      {new Date(record.date).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>{record.quantity}</TableCell>
                    <TableCell>{record.reason}</TableCell>
                    <TableCell>
                      {record.rating ? (
                        <Rating value={record.rating} readOnly size="small" />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{record.comment || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      )}

      {/* Add Tasting Form Dialog */}
      <AddTastingDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        onSave={async (consumption) => {
          await recordTasting(consumption);
          setShowForm(false);
        }}
        wineId={wineId}
      />
    </Box>
  );
};

/**
 * Add Tasting Dialog
 */
const AddTastingDialog = ({ open, onClose, onSave, wineId }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    wine_id: wineId,
    quantity: 1,
    rating: 0,
    comment: '',
    reason: 'tasting',
    date: new Date().toISOString().split('T')[0],
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

    if (formData.quantity < 1) {
      setError('La quantité doit être au moins 1');
      return;
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

  const reasons = ['tasting', 'sale', 'gift', 'loss'];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box sx={{ p: 3 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography variant="h6">Enregistrer une dégustation</Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Date"
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              fullWidth
              InputLabelProps={{ shrink: true }}
              size="small"
            />

            <TextField
              label="Quantité (bouteilles)"
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              inputProps={{ min: 1 }}
              fullWidth
              size="small"
            />

            <Box>
              <Typography variant="labelMedium" sx={{ mb: 1 }}>
                Note
              </Typography>
              <Rating
                value={formData.rating}
                onChange={(e, value) =>
                  setFormData(prev => ({ ...prev, rating: value }))
                }
              />
            </Box>

            <TextField
              select
              label="Raison"
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              SelectProps={{ native: true }}
              fullWidth
              size="small"
            >
              <option value="tasting">Dégustation</option>
              <option value="sale">Vente</option>
              <option value="gift">Cadeau</option>
              <option value="loss">Perte</option>
            </TextField>

            <TextField
              label="Commentaire"
              name="comment"
              value={formData.comment}
              onChange={handleChange}
              multiline
              rows={3}
              fullWidth
              size="small"
            />

            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ pt: 2 }}>
              <Button variant="outlined" onClick={onClose} disabled={loading}>
                Annuler
              </Button>
              <Button
                variant="contained"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Box>
    </Dialog>
  );
};

export default TastingHistoryScreen;
