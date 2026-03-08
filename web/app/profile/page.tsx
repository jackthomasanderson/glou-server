'use client';

import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Box, 
  Typography, 
  Paper, 
  TextField, 
  Button, 
  Grid, 
  MenuItem, 
  Select, 
  FormControl, 
  InputLabel,
  Alert,
  Avatar,
  CircularProgress
} from '@mui/material';
import { MainLayout } from '@/components/ui/MainLayout';
import { TwoFactorSettings } from '@/components/profile/TwoFactorSettings';
import { useMe, useUpdateProfile, useUpdatePreferences } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { data: user, isLoading: isLoadingUser } = useMe();
  const updateProfile = useUpdateProfile();
  const updatePrefs = useUpdatePreferences();

  const [profileData, setProfileData] = useState({
    displayName: '',
    slogan: ''
  });

  const [prefsData, setPrefsData] = useState({
    theme: 'LIGHT' as 'LIGHT' | 'DARK',
    language: 'FR' as 'FR' | 'EN',
    tempUnit: 'CELSIUS' as 'CELSIUS' | 'FAHRENHEIT'
  });

  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setProfileData({
        displayName: user.displayName || '',
        slogan: user.slogan || ''
      });
      setPrefsData({
        theme: user.theme,
        language: user.language,
        tempUnit: user.tempUnit
      });
    }
  }, [user]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(profileData, {
      onSuccess: () => {
        setSuccessMsg(t('common.profile.saveSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    });
  };

  const handlePrefsChange = (field: string, value: string) => {
    const newPrefs = { ...prefsData, [field]: value };
    setPrefsData(newPrefs);
    updatePrefs.mutate(newPrefs, {
      onSuccess: () => {
        setSuccessMsg(t('common.profile.saveSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    });
  };

  if (isLoadingUser) {
    return (
      <MainLayout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
          <CircularProgress />
        </Box>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Container maxWidth="md">
        <Box sx={{ my: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t('common.profile.title')}
          </Typography>

          {successMsg && (
            <Alert severity="success" sx={{ mb: 3 }}>
              {successMsg}
            </Alert>
          )}

          <Grid container spacing={4}>
            {/* Colonne de gauche: Infos Personnelles */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%', borderRadius: 3 }}>
                <Box display="flex" alignItems="center" gap={1.5} mb={3}>
                  <PersonIcon color="primary" />
                  <Typography variant="h6" fontWeight={600}>
                    {t('common.profile.personalInfo')}
                  </Typography>
                </Box>

                <Box display="flex" flexDirection="column" alignItems="center" mb={4}>
                  <Avatar 
                    sx={{ width: 80, height: 80, bgcolor: 'primary.main', mb: 2, fontSize: '2rem' }}
                  >
                    {user?.username?.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography variant="subtitle1" fontWeight={700}>
                    @{user?.username}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {user?.email}
                  </Typography>
                </Box>

                <Box component="form" onSubmit={handleProfileSubmit}>
                  <TextField
                    fullWidth
                    label={t('common.auth.displayName')}
                    value={profileData.displayName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                    margin="normal"
                    size="small"
                  />
                  <TextField
                    fullWidth
                    label={t('common.profile.slogan')}
                    value={profileData.slogan}
                    onChange={(e) => setProfileData(prev => ({ ...prev, slogan: e.target.value }))}
                    placeholder={t('common.profile.sloganPlaceholder')}
                    margin="normal"
                    size="small"
                    multiline
                    rows={2}
                  />
                  <Button 
                    type="submit" 
                    variant="contained" 
                    fullWidth 
                    sx={{ mt: 3 }}
                    disabled={updateProfile.isPending}
                  >
                    {updateProfile.isPending ? t('common.status.saving') : t('common.actions.save')}
                  </Button>
                </Box>
              </Paper>
            </Grid>

            {/* Colonne de droite: Préférences */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, height: '100%', borderRadius: 3 }}>
                <Box display="flex" alignItems="center" gap={1.5} mb={3}>
                  <SettingsIcon color="primary" />
                  <Typography variant="h6" fontWeight={600}>
                    {t('common.profile.preferences')}
                  </Typography>
                </Box>

                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('common.profile.theme')}</InputLabel>
                      <Select
                        value={prefsData.theme}
                        label={t('common.profile.theme')}
                        onChange={(e) => handlePrefsChange('theme', e.target.value)}
                      >
                        <MenuItem value="LIGHT">Clair / Light</MenuItem>
                        <MenuItem value="DARK">Sombre / Dark</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('common.profile.language')}</InputLabel>
                      <Select
                        value={prefsData.language}
                        label={t('common.profile.language')}
                        onChange={(e) => handlePrefsChange('language', e.target.value)}
                      >
                        <MenuItem value="FR">Français</MenuItem>
                        <MenuItem value="EN">English</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('common.profile.tempUnit')}</InputLabel>
                      <Select
                        value={prefsData.tempUnit}
                        label={t('common.profile.tempUnit')}
                        onChange={(e) => handlePrefsChange('tempUnit', e.target.value)}
                      >
                        <MenuItem value="CELSIUS">°Celsius</MenuItem>
                        <MenuItem value="FAHRENHEIT">°Fahrenheit</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 5, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    Les changements de thème et de langue s'appliquent instantanément et sont sauvegardés sur votre compte.
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>

          {/* Sécurité */}
          {user && (
            <TwoFactorSettings user={user} />
          )}

        </Box>
      </Container>
    </MainLayout>
  );
}
