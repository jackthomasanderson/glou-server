import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Button,
  TextField,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  Switch,
  FormControlLabel,
  useTheme,
  alpha,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Save as SaveIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  CloudUpload as BackupIcon,
  People as PeopleIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import api from '../services/apiClient';
import UserManagementScreen from './UserManagementScreen';

/**
 * TabPanel Component
 */
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

/**
 * AdvancedSettingsScreen - "Gestion Avancée"
 * 
 * Rebranded Admin panel for collection management
 * Includes:
 * - Collection configuration
 * - User management (Admin only)
 * - Activity logs
 * - Backup & export
 * - Security settings
 * - Data management (Import bottles, Configure enrichment)
 */
const AdvancedSettingsScreen = () => {
  const theme = useTheme();
  const userLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  const isFr = userLang.startsWith('fr');
  const t = (fr, en) => (isFr ? fr : en);
  const [currentTab, setCurrentTab] = useState(0);

  const [settings, setSettings] = useState({
    collectionName: 'Ma Cave',
    description: '',
    enableAutoBackup: true,
    enableImageRecognition: false,
    theme: 'light',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const appSettings = await api.getAdminSettings?.();
        if (appSettings) {
          setSettings(prev => ({...prev, ...appSettings}));
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      await api.updateAdminSettings?.(settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Erreur lors de la sauvegarde des paramètres');
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, checked, type } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ padding: 3 }}>
      {/* Page Header */}
      <Box sx={{ marginBottom: 4 }}>
        <Typography variant="h4" sx={{ color: theme.palette.onSurface, marginBottom: 1, fontWeight: 600 }}>
          {t('Gestion Avancée', 'Advanced Settings')}
        </Typography>
        <Typography variant="body1" sx={{ color: theme.palette.onSurfaceVariant }}>
          {t('Configurez votre collection privée et gérez les paramètres avancés.', 'Configure your private collection and manage advanced settings.')}
        </Typography>
      </Box>

      {/* Tabs Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)}>
          <Tab icon={<SettingsIcon />} label={t('Paramètres', 'Settings')} />
          <Tab icon={<PeopleIcon />} label={t('Utilisateurs', 'Users')} />
          <Tab icon={<BackupIcon />} label={t('Sauvegarde', 'Backup')} />
          <Tab icon={<HistoryIcon />} label={t('Logs', 'Activity Logs')} />
        </Tabs>
      </Box>

      {/* Tab 0: Settings */}
      <TabPanel value={currentTab} index={0}>
      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ marginBottom: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ marginBottom: 2 }}>
          {t('Paramètres sauvegardés avec succès', 'Settings saved successfully')}
        </Alert>
      )}

      {/* Settings Grid */}
      <Grid container spacing={3}>
        {/* Collection Settings */}
        <Grid item xs={12} md={6}>
          <Card sx={{
            backgroundColor: theme.palette.surface,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
          }}>
            <CardHeader
              avatar={<SettingsIcon sx={{ color: theme.palette.primary.main }} />}
              title={t('Configuration de la Collection', 'Collection Settings')}
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              sx={{ backgroundColor: alpha(theme.palette.primary.main, 0.05) }}
            />
            <Divider />
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  label={t('Nom de votre collection', 'Collection Name')}
                  name="collectionName"
                  value={settings.collectionName}
                  onChange={handleInputChange}
                  variant="outlined"
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: theme.palette.background.default,
                    },
                  }}
                />
                <TextField
                  fullWidth
                  label={t('Description', 'Description')}
                  name="description"
                  value={settings.description}
                  onChange={handleInputChange}
                  variant="outlined"
                  size="small"
                  multiline
                  rows={3}
                  placeholder={t('Parlez de votre collection...', 'Tell about your collection...')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: theme.palette.background.default,
                    },
                  }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      name="enableImageRecognition"
                      checked={settings.enableImageRecognition}
                      onChange={handleInputChange}
                    />
                  }
                  label={t('Activer la reconnaissance d\'images', 'Enable Image Recognition')}
                />
                <Typography variant="caption" sx={{ color: theme.palette.onSurfaceVariant }}>
                  {t('Permet de scanner les étiquettes de bouteilles automatiquement.', 'Automatically recognize bottle labels from photos.')}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Backup & Export */}
        <Grid item xs={12} md={6}>
          <Card sx={{
            backgroundColor: theme.palette.surface,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
          }}>
            <CardHeader
              avatar={<BackupIcon sx={{ color: theme.palette.tertiary.main }} />}
              title={t('Sauvegarde & Export', 'Backup & Export')}
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              sx={{ backgroundColor: alpha(theme.palette.tertiary.main, 0.05) }}
            />
            <Divider />
            <CardContent>
              <Stack spacing={2}>
                <FormControlLabel
                  control={
                    <Switch
                      name="enableAutoBackup"
                      checked={settings.enableAutoBackup}
                      onChange={handleInputChange}
                    />
                  }
                  label={t('Sauvegarde automatique hebdomadaire', 'Weekly Automatic Backup')}
                />
                <Typography variant="body2" sx={{ color: theme.palette.onSurfaceVariant }}>
                  {t('Vos données sont sauvegardées chaque semaine dans votre serveur personnel.', 'Your data is backed up weekly on your personal server.')}
                </Typography>
                
                <Button
                  variant="outlined"
                  startIcon={<BackupIcon />}
                  fullWidth
                  sx={{
                    marginTop: 1,
                    borderColor: theme.palette.divider,
                    color: theme.palette.onSurface,
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    },
                  }}
                >
                  {t('Télécharger une sauvegarde', 'Download Backup')}
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<BackupIcon />}
                  fullWidth
                  sx={{
                    borderColor: theme.palette.divider,
                    color: theme.palette.onSurface,
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    },
                  }}
                >
                  {t('Exporter au format CSV', 'Export as CSV')}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Security & Privacy */}
        <Grid item xs={12} md={6}>
          <Card sx={{
            backgroundColor: theme.palette.surface,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
          }}>
            <CardHeader
              avatar={<SecurityIcon sx={{ color: theme.palette.error.main }} />}
              title={t('Sécurité & Vie Privée', 'Security & Privacy')}
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              sx={{ backgroundColor: alpha(theme.palette.error.main, 0.05) }}
            />
            <Divider />
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.onSurface }}>
                  {t('Chiffrement des données', 'Data Encryption')}
                </Typography>
                <Typography variant="caption" sx={{ color: theme.palette.onSurfaceVariant }}>
                  {t('Vos données sont chiffrées en AES-256-GCM et stockées localement sur votre serveur personnel. Aucune donnée n\'est partagée avec des tiers.', 'Your data is encrypted with AES-256-GCM and stored locally on your personal server. No data is shared with third parties.')}
                </Typography>
                
                <Divider sx={{ marginY: 1 }} />
                
                <Button
                  variant="outlined"
                  fullWidth
                  sx={{
                    borderColor: theme.palette.error.main,
                    color: theme.palette.error.main,
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.error.main, 0.05),
                    },
                  }}
                >
                  {t('Réinitialiser le mot de passe', 'Reset Password')}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Data Management */}
        <Grid item xs={12} md={6}>
          <Card sx={{
            backgroundColor: theme.palette.surface,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '12px',
          }}>
            <CardHeader
              title={t('Gestion des Données', 'Data Management')}
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              sx={{ backgroundColor: alpha(theme.palette.secondary.main, 0.05) }}
            />
            <Divider />
            <CardContent>
              <Stack spacing={2}>
                <Button
                  variant="outlined"
                  fullWidth
                  sx={{
                    borderColor: theme.palette.divider,
                    color: theme.palette.onSurface,
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    },
                  }}
                >
                  {t('Importer des bouteilles (JSON)', 'Import Bottles (JSON)')}
                </Button>
                
                <Button
                  variant="outlined"
                  fullWidth
                  sx={{
                    borderColor: theme.palette.divider,
                    color: theme.palette.onSurface,
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    },
                  }}
                >
                  {t('Importer des bouteilles (CSV)', 'Import Bottles (CSV)')}
                </Button>

                <Button
                  variant="outlined"
                  fullWidth
                  sx={{
                    borderColor: theme.palette.divider,
                    color: theme.palette.onSurface,
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    },
                  }}
                >
                  {t('Effacer toutes les données', 'Delete All Data')}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Save Button */}
      <Box sx={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSaveSettings}
          disabled={saving}
          sx={{
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.onPrimary,
            textTransform: 'none',
            borderRadius: '8px',
            '&:hover': {
              backgroundColor: theme.palette.primary.dark,
            },
          }}
        >
          {saving ? t('Sauvegarde...', 'Saving...') : t('Sauvegarder', 'Save Settings')}
        </Button>
      </Box>
      </TabPanel>

      {/* Tab 1: User Management */}
      <TabPanel value={currentTab} index={1}>
        <UserManagementScreen />
      </TabPanel>

      {/* Tab 2: Backup & Export */}
      <TabPanel value={currentTab} index={2}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('Les fonctions de sauvegarde automatique sont en cours de développement.', 'Automatic backup features are under development.')}
        </Alert>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title={t('Exporter les données', 'Export Data')} />
              <CardContent>
                <Stack spacing={2}>
                  <Button variant="outlined" fullWidth>
                    {t('Exporter en JSON', 'Export as JSON')}
                  </Button>
                  <Button variant="outlined" fullWidth>
                    {t('Exporter en CSV', 'Export as CSV')}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Tab 3: Activity Logs */}
      <TabPanel value={currentTab} index={3}>
        <Alert severity="info">
          {t('Les logs d\'activité détaillés seront bientôt disponibles.', 'Detailed activity logs will be available soon.')}
        </Alert>
      </TabPanel>
    </Box>
  );
};

export default AdvancedSettingsScreen;
