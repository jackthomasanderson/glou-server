import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Grid,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../services/apiClient';

/**
 * TobaccoListScreen - Liste des tabacs
 */
export const TobaccoListScreen = () => {
  const navigate = useNavigate();
  const [tobaccos, setTobaccos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTobaccos();
  }, []);

  const fetchTobaccos = async () => {
    try {
      setLoading(true);
      const data = await api.getTobacco();
      setTobaccos(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce tabac ?')) {
      return;
    }
    try {
      await api.deleteTobacco(id);
      fetchTobaccos();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Collection de Tabac</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/tobacco/add')}
        >
          Ajouter un Tabac
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {tobaccos.length === 0 ? (
        <Alert severity="info">
          Aucun tabac dans votre collection. Commencez par en ajouter un !
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {tobaccos.map((tobacco) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={tobacco.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="h6" gutterBottom>
                      {tobacco.name}
                    </Typography>
                    <Box>
                      <Tooltip title="Modifier">
                        <IconButton size="small" onClick={() => navigate(`/tobacco/${tobacco.id}/edit`)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Supprimer">
                        <IconButton size="small" onClick={() => handleDelete(tobacco.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {tobacco.brand || 'Sans marque'}
                  </Typography>

                  <Box sx={{ mt: 2 }}>
                    <Chip 
                      label={tobacco.type || 'Type inconnu'} 
                      size="small" 
                      sx={{ mr: 1 }} 
                    />
                    <Chip 
                      label={`${tobacco.quantity || 0} unité(s)`} 
                      size="small" 
                      color="primary"
                    />
                  </Box>

                  {tobacco.notes && (
                    <Typography variant="body2" sx={{ mt: 2 }}>
                      {tobacco.notes}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default TobaccoListScreen;

