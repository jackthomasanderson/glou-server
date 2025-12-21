import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  TextField,
  Grid,
  Typography,
  useTheme,
  Stack,
  Chip,
  Dialog,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { useWines } from '../hooks/useApi';
import { WineGrid } from '../components/WineCard';
import WineDetailScreen from './WineDetailScreen';
import WineCreateForm from './WineCreateForm';

/**
 * Wine List Screen - Display all wines with filtering, sorting, and actions
 */
export const WineListScreen = () => {
  const theme = useTheme();
  const {
    wines,
    loading,
    error,
    searchWines,
    createWine,
    updateWine,
    deleteWine,
  } = useWines();

  // UI State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedWineId, setSelectedWineId] = useState(null);
  const [showDetailView, setShowDetailView] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter State
  const [filters, setFilters] = useState({
    name: '',
    producer: '',
    region: '',
    type: '',
    min_vintage: '',
    max_vintage: '',
    min_price: '',
    max_price: '',
    min_rating: '',
  });

  // Handle search/filter
  const handleSearch = async () => {
    const activeFilters = Object.keys(filters).reduce((acc, key) => {
      if (filters[key]) acc[key] = filters[key];
      return acc;
    }, {});

    if (Object.keys(activeFilters).length > 0) {
      await searchWines(activeFilters);
    } else {
      // Reset to all wines
      window.location.reload();
    }
  };

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Get selected wine for detail view
  const selectedWine = wines.find(w => w.id === selectedWineId);

  // Wine type options
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
        <Box>
          <Typography variant="h4" sx={{ color: theme.palette.onSurface, mb: 1 }}>
            🍾 Mes Vins
          </Typography>
          <Typography variant="bodySmall" sx={{ color: theme.palette.onSurfaceVariant }}>
            {wines.length} bouteille{wines.length !== 1 ? 's' : ''} en cave
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => setShowCreateForm(true)}
          sx={{
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.onPrimary,
          }}
        >
          Ajouter
        </Button>
      </Box>

      {/* Error Message */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Filter Bar */}
      <Card
        sx={{
          backgroundColor: theme.palette.surfaceMedium,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: '12px',
          mb: 3,
          p: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: showFilters ? 2 : 0,
          }}
        >
          {/* Quick Search */}
          <TextField
            size="small"
            placeholder="Chercher par nom..."
            value={filters.name}
            onChange={(e) => handleFilterChange('name', e.target.value)}
            sx={{ flex: 1, mr: 2 }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: theme.palette.onSurfaceVariant }} />,
            }}
          />

          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<FilterIcon />}
              variant={showFilters ? 'contained' : 'outlined'}
              onClick={() => setShowFilters(!showFilters)}
              size="small"
            >
              Filtres
            </Button>
            <Button
              variant="contained"
              onClick={handleSearch}
              size="small"
            >
              Chercher
            </Button>
          </Stack>
        </Box>

        {/* Advanced Filters */}
        {showFilters && (
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Producteur"
                  size="small"
                  fullWidth
                  value={filters.producer}
                  onChange={(e) => handleFilterChange('producer', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Région"
                  size="small"
                  fullWidth
                  value={filters.region}
                  onChange={(e) => handleFilterChange('region', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  label="Type"
                  size="small"
                  fullWidth
                  value={filters.type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  SelectProps={{
                    native: true,
                  }}
                >
                  <option value="">Tous</option>
                  {wineTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Millésime min"
                  size="small"
                  type="number"
                  fullWidth
                  value={filters.min_vintage}
                  onChange={(e) => handleFilterChange('min_vintage', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Millésime max"
                  size="small"
                  type="number"
                  fullWidth
                  value={filters.max_vintage}
                  onChange={(e) => handleFilterChange('max_vintage', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Prix min (€)"
                  size="small"
                  type="number"
                  fullWidth
                  value={filters.min_price}
                  onChange={(e) => handleFilterChange('min_price', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Prix max (€)"
                  size="small"
                  type="number"
                  fullWidth
                  value={filters.max_price}
                  onChange={(e) => handleFilterChange('max_price', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Note min"
                  size="small"
                  type="number"
                  fullWidth
                  inputProps={{ min: 0, max: 5, step: 0.5 }}
                  value={filters.min_rating}
                  onChange={(e) => handleFilterChange('min_rating', e.target.value)}
                />
              </Grid>
            </Grid>

            {/* Active Filters Display */}
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {Object.entries(filters).map(([key, value]) => {
                  if (!value) return null;
                  return (
                    <Chip
                      key={key}
                      label={`${key}: ${value}`}
                      onDelete={() => handleFilterChange(key, '')}
                      size="small"
                      variant="outlined"
                    />
                  );
                })}
              </Stack>
            </Box>
          </Box>
        )}
      </Card>

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Wine Grid */}
      {!loading && (
        <WineGrid
          wines={wines}
          onView={(id) => {
            setSelectedWineId(id);
            setShowDetailView(true);
          }}
          onEdit={(id) => {
            // TODO: Implement edit functionality
            console.log('Edit wine', id);
          }}
          onDelete={(id) => {
            if (window.confirm('Êtes-vous sûr?')) {
              deleteWine(id);
            }
          }}
        />
      )}

      {/* Create Form Dialog */}
      <Dialog
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        maxWidth="sm"
        fullWidth
      >
        <WineCreateForm
          onClose={() => setShowCreateForm(false)}
          onSave={async (wine) => {
            await createWine(wine);
            setShowCreateForm(false);
          }}
        />
      </Dialog>

      {/* Detail View Dialog */}
      <Dialog
        open={showDetailView && !!selectedWine}
        onClose={() => setShowDetailView(false)}
        maxWidth="md"
        fullWidth
      >
        {selectedWine && (
          <WineDetailScreen
            wineId={selectedWine.id}
            wine={selectedWine}
            onUpdate={async (updated) => {
              await updateWine(selectedWine.id, updated);
              setShowDetailView(false);
            }}
            onDelete={async () => {
              await deleteWine(selectedWine.id);
              setShowDetailView(false);
            }}
          />
        )}
      </Dialog>
    </Box>
  );
};

export default WineListScreen;
