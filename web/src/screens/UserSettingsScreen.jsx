import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Divider,
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import api from '../services/apiClient';

/**
 * UserSettingsScreen - Paramètres utilisateur
 * (Écran de base - à implémenter selon besoins)
 */
export const UserSettingsScreen = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.newPassword && !formData.currentPassword) {
      setError('Veuillez saisir votre mot de passe actuel pour le modifier');
      return;
    }

    setLoading(true);
    try {
      // TODO: Implémenter l'API de mise à jour utilisateur
      // await api.updateUser(formData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Erreur lors de la mise à jour');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Paramètres Utilisateur
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Cette section est en cours de développement. Les modifications de profil seront bientôt disponibles.
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Modifications enregistrées avec succès !</Alert>}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Informations du compte
          </Typography>
          
          <Box component="form" onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nom d'utilisateur"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  disabled
                  helperText="Le nom d'utilisateur ne peut pas être modifié"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled
                  helperText="L'email ne peut pas être modifié pour le moment"
                />
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Changer le mot de passe
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Mot de passe actuel"
                  name="currentPassword"
                  type="password"
                  value={formData.currentPassword}
                  onChange={handleChange}
                  disabled
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Nouveau mot de passe"
                  name="newPassword"
                  type="password"
                  value={formData.newPassword}
                  onChange={handleChange}
                  disabled
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Confirmer le mot de passe"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled
                />
              </Grid>

              <Grid item xs={12}>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                  disabled={loading || true}
                  fullWidth
                >
                  Enregistrer les modifications (Bientôt disponible)
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Préférences
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Les préférences de langue, thème et notifications seront disponibles prochainement.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default UserSettingsScreen;
