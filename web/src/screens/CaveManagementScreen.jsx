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

  // Initialize with mock data
  useEffect(() => {
    const mockCaves = [
      {
        id: 1,
        name: 'Cave du Rez-de-chaussée',
        description: 'Température 12°C, humidité 70%',
        temperature: 12,
        humidity: 70,
        cells: [
          { id: 1, row: 'A', column: 1, wines: 4 },
          { id: 2, row: 'A', column: 2, wines: 2 },
          { id: 3, row: 'B', column: 1, wines: 6 },
        ],
      },
      {
        id: 2,
        name: 'Cave climatisée',
        description: 'Système de refroidissement actif',
        temperature: 10,
        humidity: 75,
        cells: [
          { id: 4, row: 'A', column: 1, wines: 8 },
          { id: 5, row: 'A', column: 2, wines: 5 },
        ],
      },
    ];
    setCaves(mockCaves);
    setLoading(false);
  }, []);

  const handleAddCave = () => {
    setFormData({ name: '', description: '' });
    setSelectedCave(null);
    setOpenCaveDialog(true);
  };

  const handleEditCave = (cave) => {
    setFormData({ name: cave.name, description: cave.description });
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
          ? { ...cave, name: formData.name, description: formData.description }
          : cave
      ));
    } else {
      // Add new cave
      const newCave = {
        id: Math.max(...caves.map(c => c.id), 0) + 1,
        name: formData.name,
        description: formData.description,
        temperature: 12,
        humidity: 70,
        cells: [],
      };
      setCaves([...caves, newCave]);
    }

    setOpenCaveDialog(false);
    setError(null);
  };

  const handleDeleteCave = (id) => {
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
        <Typography variant="h5" sx={{ color: theme.palette.onSurface }}>
          Gestion des caves
        </Typography>
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
                      {cave.description}
                    </Typography>
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

                {/* Conditions */}
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <Chip
                    label={`${cave.temperature}°C`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${cave.humidity}% humidité`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>

                {/* Cells Grid */}
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ color: theme.palette.onSurfaceVariant, mb: 1 }}
                  >
                    Celliers ({cave.cells.length})
                  </Typography>
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
          <Typography variant="h6" sx={{ mb: 2 }}>
            {selectedCave ? 'Modifier la cave' : 'Nouvelle cave'}
          </Typography>
          <TextField
            fullWidth
            label="Nom de la cave"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            size="small"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            multiline
            rows={3}
            size="small"
            sx={{ mb: 2 }}
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
      />
    </Box>
  );
};

/**
 * Dialog to add a new cell
 */
const CellDialog = ({ open, onClose, onSave }) => {
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
        <Typography variant="h6" sx={{ mb: 2 }}>
          Nouveau cellier
        </Typography>
        <TextField
          fullWidth
          label="Rangée"
          value={row}
          onChange={(e) => setRow(e.target.value)}
          placeholder="ex: A"
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          fullWidth
          label="Colonne"
          value={column}
          onChange={(e) => setColumn(e.target.value)}
          placeholder="ex: 1"
          type="number"
          size="small"
          sx={{ mb: 2 }}
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
