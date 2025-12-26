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
  const [caveCells, setCaveCells] = useState({});
  const [caveBottles, setCaveBottles] = useState({});
  const [openCaveDialog, setOpenCaveDialog] = useState(false);
  const [openCellDialog, setOpenCellDialog] = useState(false);
  const [selectedCave, setSelectedCave] = useState(null);
  const [formData, setFormData] = useState({ name: '', model: '', location: 'Principale', capacity: 100 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const caveData = await api.getCaves();
        const cavesList = caveData || [];
        setCaves(cavesList);

        // Si une seule cave, charger ses bouteilles
        if (cavesList.length === 1) {
          const bottleData = await api.getCaveBottles(cavesList[0].id);
          setCaveBottles({ [cavesList[0].id]: bottleData || [] });
          setSelectedCave(cavesList[0]);
        }

        // Charger les cellules pour chaque cave
        if (cavesList.length > 0) {
          const entries = await Promise.all(
            cavesList.map(async (cave) => {
              try {
                const cells = await api.getCells(cave.id);
                return [cave.id, cells || []];
              } catch (cellErr) {
                console.error('Failed to fetch cells for cave', cave.id, cellErr);
                return [cave.id, []];
              }
            })
          );
          setCaveCells(Object.fromEntries(entries));
        } else {
          setCaveCells({});
        }
      } catch (err) {
        console.error('Failed to fetch data', err);
        setError('Impossible de charger les caves. Vérifiez que le backend est démarré.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAddCave = () => {
    setFormData({ name: '', model: '', location: 'Principale', capacity: 100 });
    setSelectedCave(null);
    setError(null);
    setOpenCaveDialog(true);
  };

  const handleEditCave = (cave) => {
    setFormData({
      name: cave.name,
      model: cave.model || '',
      location: cave.location || 'Principale',
      capacity: cave.capacity ?? 100,
    });
    setSelectedCave(cave);
    setOpenCaveDialog(true);
  };

  const handleSaveCave = async () => {
    if (!formData.name) {
      setError('Le nom de la cave est obligatoire');
      return;
    }
    setSaving(true);

    const payload = {
      name: formData.name.trim(),
      model: formData.model?.trim() || null,
      location: formData.location?.trim() || 'Principale',
      capacity: Math.max(0, parseInt(formData.capacity ?? 0, 10) || 0),
    };

    try {
      if (selectedCave) {
        const updated = await api.updateCave(selectedCave.id, payload);
        setCaves((prev) => prev.map((c) => (c.id === selectedCave.id ? updated : c)));
      } else {
        const created = await api.createCave(payload);
        setCaves((prev) => [created, ...prev]);
        setCaveCells((prev) => ({ ...prev, [created.id]: [] }));
      }

      setOpenCaveDialog(false);
      setError(null);
      setSelectedCave(null);
    } catch (err) {
      setError(err.message || "Impossible d'enregistrer la cave");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCave = (id) => {
    setError("La suppression d'une cave n'est pas encore disponible.");
  };

  const handleAddCell = (cave) => {
    setSelectedCave(cave);
    setError(null);
    setOpenCellDialog(true);
  };

  const handleSaveCell = async (row, column, capacityValue = 0) => {
    if (!selectedCave) return;
    const location = `${row}-${column}`.trim();
    const payload = {
      cave_id: selectedCave.id,
      location,
      capacity: Math.max(0, parseInt(capacityValue ?? 0, 10) || 0),
    };

    try {
      const cell = await api.createCell(payload);
      setCaveCells((prev) => ({
        ...prev,
        [selectedCave.id]: [...(prev[selectedCave.id] || []), cell],
      }));
      setOpenCellDialog(false);
    } catch (err) {
      setError(err.message || "Impossible d'ajouter le cellier");
    }
  };

  const handleDeleteCell = (caveId, cellId) => {
    setError("La suppression d'un cellier n'est pas encore disponible.");
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
        {caves.map((cave) => {
          const cellsForCave = caveCells[cave.id] || [];
          const cellIds = new Set(cellsForCave.map((cell) => cell.id));
          const temperature = cave.temperature ?? 12;
          const humidity = cave.humidity ?? 70;

          return (
            <Grid item xs={12} md={6} key={cave.id}>
              <Card
                sx={{
                  border: `1px solid ${theme.palette.onSurface}`,
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
                        sx={{ color: theme.palette.error.main }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>

                  {/* Liquid Gauge */}
                  {(() => {
                    const total = cellsForCave.reduce((sum, cell) => sum + (cell.current || 0), 0);
                    const capacity = cave.capacity || 100;
                    const pct = Math.min(100, capacity > 0 ? Math.round((total / capacity) * 100) : 0);
                    return (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ color: theme.palette.onSurfaceVariant, mb: 0.5 }}>
                          Remplissage: {pct}%
                        </Typography>
                        <Box sx={{ position: 'relative', height: 24, borderRadius: 12, backgroundColor: theme.palette.surfaceLight, overflow: 'hidden', border: `1px solid ${theme.palette.onSurface}` }}>
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
                      label={`${temperature}°C`}
                      size="small"
                      variant="outlined"
                      title="Température actuelle de la cave"
                    />
                    <Chip
                      label={`${humidity}% humidité`}
                      size="small"
                      variant="outlined"
                      title="Humidité actuelle de la cave"
                    />
                  </Stack>

                  {/* Distribution Pie Chart */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ color: theme.palette.onSurfaceVariant, mb: 1 }}>Répartition des produits</Typography>
                    <ProductTypePieChart
                      wines={wines.filter((w) => w.cell_id && cellIds.has(w.cell_id))}
                      tobaccos={tobaccos.filter((t) => t.cave_id === cave.id)}
                    />
                  </Box>

                  {/* Cells Grid */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{ color: theme.palette.onSurfaceVariant }}
                      >
                        Celliers ({cellsForCave.length})
                      </Typography>
                      <HelpIcon 
                        title="Celliers"
                        description="Chaque cellier correspond à une zone de rangement ou une étagère dans votre cave."
                      />
                    </Box>
                    {cellsForCave.length > 0 ? (
                      <Grid container spacing={1}>
                        {cellsForCave.map((cell) => (
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
                                {cell.location || 'Cellier'}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: theme.palette.onSurfaceVariant,
                                }}
                              >
                                {cell.current ?? 0} bouteille(s)
                              </Typography>
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteCell(cave.id, cell.id)}
                                sx={{
                                  position: 'absolute',
                                  top: 0,
                                  right: 0,
                                  color: theme.palette.error.main,
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
          );
        })}
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
          <HelpLabel 
            label="Capacité (bouteilles)"
            helpTitle="Capacité totale"
            helpDescription="Nombre maximum de bouteilles que peut contenir cette cave."
          />
          <TextField
            fullWidth
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
            placeholder="ex: 120"
            type="number"
            size="small"
            sx={{ mb: 2, mt: 1 }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              variant="outlined"
              onClick={() => setOpenCaveDialog(false)}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              variant="contained"
              onClick={handleSaveCave}
              disabled={saving}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
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
  const [capacity, setCapacity] = useState('');

  const handleSave = async () => {
    if (row && column) {
      try {
        await onSave(row, column, capacity);
        setRow('');
        setColumn('');
        setCapacity('');
      } catch (err) {
        console.error('Failed to save cell', err);
      }
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
        <HelpLabel 
          label="Capacité (optionnel)"
          helpTitle="Capacité"
          helpDescription="Indiquez combien de bouteilles peut contenir ce cellier."
        />
        <TextField
          fullWidth
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="ex: 12"
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
