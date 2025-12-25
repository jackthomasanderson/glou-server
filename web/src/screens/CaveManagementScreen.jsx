import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Typography,
  Dialog,
  TextField,
  Stack,
  Chip,
  useTheme,
  IconButton,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { HelpIcon, HelpLabel } from '../components/HelpIcon';
import ProductTypePieChart from '../components/ProductTypePieChart';
import api from '../services/apiClient';

/**
 * CaveManagementScreen - Manage wine storage locations (caves and cells)
 */
const CaveManagementScreen = () => {
  const theme = useTheme();
  const [caves, setCaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openCaveDialog, setOpenCaveDialog] = useState(false);
  const [openCellDialog, setOpenCellDialog] = useState(false);
  const [selectedCave, setSelectedCave] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [wines, setWines] = useState([]);
  const [tobaccos, setTobaccos] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [w, t] = await Promise.all([api.getWines(), api.getTobacco()]);
        setWines(w || []);
        setTobaccos(t || []);
      } catch (err) {
        console.error('Failed to fetch data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAddCave = () => {
    setFormData({ name: '', model: '', location: 'Principale' });
    setSelectedCave(null);
    setOpenCaveDialog(true);
  };

  const handleEditCave = (cave) => {
    setFormData({ name: cave.name, model: cave.model || '', location: cave.location || 'Principale' });
    setSelectedCave(cave);
    setOpenCaveDialog(true);
  };

  const handleSaveCave = () => {
    if (!formData.name) {
      setError('Le nom de la cave est obligatoire');
      return;
    }

    if (selectedCave) {
      // Update existing cave
      setCaves(caves.map(cave =>
        cave.id === selectedCave.id
          ? { ...cave, name: formData.name, model: formData.model, location: formData.location }
          : cave
      ));
    } else {
      // Add new cave
      const newCave = {
        id: Math.max(...caves.map(c => c.id), 0) + 1,
        name: formData.name,
        model: formData.model || null,
        location: formData.location || 'Principale',
        temperature: 12,
        humidity: 70,
        capacity: 100,
        current: 0,
        cells: [],
      };
      setCaves([...caves, newCave]);
    }

    setOpenCaveDialog(false);
    setError(null);
  };

  const handleDeleteCave = (id) => {
    const cave = caves.find(c => c.id === id);
    const occupied = cave ? cave.cells.some(cell => (cell.wines || 0) > 0) : false;
    if (occupied) {
      setError('Suppression interdite: la cave contient encore des produits');
      return;
    }
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette cave ?')) {
      setCaves(caves.filter(cave => cave.id !== id));
    }
  };

  const handleAddCell = (cave) => {
    setSelectedCave(cave);
    setOpenCellDialog(true);
  };

  const handleSaveCell = (row, column) => {
    const newCell = {
      id: Math.max(...caves.flatMap(c => c.cells).map(cell => cell.id), 0) + 1,
      row,
      column,
      wines: 0,
    };

    setCaves(caves.map(cave =>
      cave.id === selectedCave.id
        ? { ...cave, cells: [...cave.cells, newCell] }
        : cave
    ));

    setOpenCellDialog(false);
  };

  const handleDeleteCell = (caveId, cellId) => {
    setCaves(caves.map(cave =>
      cave.id === caveId
        ? { ...cave, cells: cave.cells.filter(cell => cell.id !== cellId) }
        : cave
    ));
  };

  if (loading) {
    return <Typography>Chargement...</Typography>;
  }

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
          <Typography variant="h5" sx={{ color: theme.palette.onSurface }}>
            Gestion des caves
          </Typography>
          <HelpIcon 
            title="Gestion des caves"
            description="Créez et organisez vos caves de stockage. Chaque cave peut contenir plusieurs cellules pour une meilleure organisation de votre collection."
          />
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddCave}
        >
          Nouvelle cave
        </Button>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Caves Grid */}
      <Grid container spacing={3}>
        {caves.map((cave) => (
          <Grid item xs={12} md={6} key={cave.id}>
            <Card
              sx={{
                border: `1px solid ${theme.palette.outline}`,
                backgroundColor: theme.palette.surfaceVariant,
              }}
            >
              <CardContent>
                {/* Cave Header */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    mb: 2,
                  }}
                >
                  <Box>
                    <Typography
                      variant="h6"
                      sx={{ color: theme.palette.onSurface, fontWeight: 600 }}
                    >
                      {cave.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: theme.palette.onSurfaceVariant }}
                    >
                      📍 {cave.location}
                    </Typography>
                    {cave.model && (
                      <Typography
                        variant="body2"
                        sx={{ color: theme.palette.onSurfaceVariant }}
                      >
                        Modèle: {cave.model}
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton
                      size="small"
                      onClick={() => handleEditCave(cave)}
                      sx={{ color: theme.palette.primary }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteCave(cave.id)}
                      sx={{ color: theme.palette.error }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>

                {/* Liquid Gauge */}
                {(() => {
                  const total = cave.cells.reduce((sum, cell) => sum + (cell.wines || 0), 0);
                  const capacity = cave.capacity || 100;
                  const pct = Math.min(100, Math.round((total / capacity) * 100));
                  return (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ color: theme.palette.onSurfaceVariant, mb: 0.5 }}>
                        Remplissage: {pct}%
                      </Typography>
                      <Box sx={{ position: 'relative', height: 24, borderRadius: 12, backgroundColor: theme.palette.surfaceLight, overflow: 'hidden', border: `1px solid ${theme.palette.outline}` }}>
                        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`, transition: 'width 0.6s ease' }} />
                        {/* Simple wave overlay */}
                        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `radial-gradient(circle at 10px 10px, ${theme.palette.primary.dark}33 10px, transparent 11px)`, opacity: 0.3 }} />
                      </Box>
                    </Box>
                  );
                })()}

                {/* Conditions */}
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <Chip
                    label={`${cave.temperature}°C`}
                    size="small"
                    variant="outlined"
                    title="Température actuelle de la cave"
                  />
                  <Chip
                    label={`${cave.humidity}% humidité`}
                    size="small"
                    variant="outlined"
                    title="Humidité actuelle de la cave"
                  />
                </Stack>

                {/* Distribution Pie Chart */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ color: theme.palette.onSurfaceVariant, mb: 1 }}>Répartition des produits</Typography>
                  <ProductTypePieChart wines={wines.filter(w => w.cell_id && caves.find(c => c.cells?.some(cell => cell.id === w.cell_id))?.id === cave.id)} tobaccos={tobaccos.filter(t => t.cave_id === cave.id)} />
                </Box>

                {/* Cells Grid */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ color: theme.palette.onSurfaceVariant }}
                    >
                      Celliers ({cave.cells.length})
                    </Typography>
                    <HelpIcon 
                      title="Celliers"
                      description="Chaque cellier correspond à une zone de rangement ou une étagère dans votre cave."
                    />
                  </Box>
                  {cave.cells.length > 0 ? (
                    <Grid container spacing={1}>
                      {cave.cells.map((cell) => (
                        <Grid item xs={4} sm={3} key={cell.id}>
                          <Card
                            sx={{
                              p: 1.5,
                              textAlign: 'center',
                              backgroundColor: theme.palette.surface,
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: theme.palette.surfaceVariant,
                              },
                              position: 'relative',
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                            >
                              {cell.row}-{cell.column}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: theme.palette.onSurfaceVariant,
                              }}
                            >
                              {cell.wines} bouteille(s)
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteCell(cave.id, cell.id)}
                              sx={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                color: theme.palette.error,
                              }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{ color: theme.palette.onSurfaceVariant, fontStyle: 'italic' }}
                    >
                      Pas de cellier encore
                    </Typography>
                  )}
                </Box>

                {/* Add Cell Button */}
                <Button
                  fullWidth
                  variant="outlined"
                  size="small"
                  onClick={() => handleAddCell(cave)}
                  startIcon={<AddIcon />}
                >
                  Ajouter un cellier
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Empty State */}
      {caves.length === 0 && (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: theme.palette.onSurfaceVariant, mb: 2 }}>
            Aucune cave enregistrée
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddCave}
          >
            Créer une cave
          </Button>
        </Card>
      )}

      {/* Cave Dialog */}
      <Dialog open={openCaveDialog} onClose={() => setOpenCaveDialog(false)}>
        <Box sx={{ p: 3, minWidth: 400 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6">
              {selectedCave ? 'Modifier la cave' : 'Nouvelle cave'}
            </Typography>
            <HelpIcon 
              title="Ajouter une cave"
              description="Une collection est un espace de stockage pour vos boissons. Elle peut contenir plusieurs cellules de rangement."
            />
          </Box>
          <HelpLabel 
            label="Nom de la cave"
            helpTitle="Nom de la cave"
            helpDescription="Donnez un nom identifiant votre cave. Exemple: Cave du rez-de-chaussée, Cave climatisée."
          />
          <TextField
            fullWidth
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            size="small"
            sx={{ mb: 2, mt: 1 }}
          />
          <HelpLabel 
            label="Localisation"
            helpTitle="Localisation"
            helpDescription="Indiquez où se trouve cette cave. Utile si vous avez plusieurs caves à différents endroits."
          />
          <TextField
            fullWidth
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="ex: Maison principale, Maison de vacances, Étranger"
            size="small"
            sx={{ mb: 2, mt: 1 }}
          />
          <HelpLabel 
            label="Modèle de cave"
            helpTitle="Modèle (optionnel)"
            helpDescription="Spécifiez le modèle ou la marque si c'est une cave climatisée."
          />
          <TextField
            fullWidth
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            placeholder="ex: La Sommelière, Climadiff"
            size="small"
            sx={{ mb: 2, mt: 1 }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              variant="outlined"
              onClick={() => setOpenCaveDialog(false)}
            >
              Annuler
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveCave}
            >
              Enregistrer
            </Button>
          </Stack>
        </Box>
      </Dialog>

      {/* Cell Dialog */}
      <CellDialog
        open={openCellDialog}
        onClose={() => setOpenCellDialog(false)}
        onSave={handleSaveCell}
        theme={theme}
      />
    </Box>
  );
};

/**
 * Dialog to add a new cell
 */
const CellDialog = ({ open, onClose, onSave, theme }) => {
  const [row, setRow] = useState('');
  const [column, setColumn] = useState('');

  const handleSave = () => {
    if (row && column) {
      onSave(row, column);
      setRow('');
      setColumn('');
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <Box sx={{ p: 3, minWidth: 400 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="h6">
            Nouveau cellier
          </Typography>
          <HelpIcon 
            title="Ajouter un cellier"
            description="Un cellier est une section de rangement au sein d'une cave. Utilisez une lettre pour la rangée et un numéro pour la colonne."
          />
        </Box>
        <HelpLabel 
          label="Rangée"
          helpTitle="Rangée"
          helpDescription="Entrez la lettre de la rangée. Exemple: A, B, C, etc."
        />
        <TextField
          fullWidth
          value={row}
          onChange={(e) => setRow(e.target.value)}
          placeholder="ex: A"
          size="small"
          sx={{ mb: 2, mt: 1 }}
        />
        <HelpLabel 
          label="Colonne"
          helpTitle="Colonne"
          helpDescription="Entrez le numéro de la colonne. Exemple: 1, 2, 3, etc."
        />
        <TextField
          fullWidth
          value={column}
          onChange={(e) => setColumn(e.target.value)}
          placeholder="ex: 1"
          type="number"
          size="small"
          sx={{ mb: 2, mt: 1 }}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="outlined" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="contained" onClick={handleSave}>
            Créer
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
};

export default CaveManagementScreen;
