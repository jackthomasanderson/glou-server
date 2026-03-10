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
import { AccountSecurity } from '@/components/profile/AccountSecurity';
import { AvatarUploader } from '@/components/profile/AvatarUploader';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { data: user, isLoading: isLoadingUser } = useMe();
  const updateProfile = useUpdateProfile();
  const updatePrefs = useUpdatePreferences();

  const [profileData, setProfileData] = useState({
    displayName: '',
    avatarUrl: '',
    appName: '',
    appSlogan: ''
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
        avatarUrl: user.avatarUrl || '',
        appName: user.appName || '',
        appSlogan: user.appSlogan || ''
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
        setSuccessMsg(t('profile.saveSuccess'));
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    });
  };

  const handlePrefsChange = (field: string, value: string) => {
    const newPrefs = { ...prefsData, [field]: value };
    setPrefsData(newPrefs);
    updatePrefs.mutate(newPrefs, {
      onSuccess: () => {
        setSuccessMsg(t('profile.saveSuccess'));
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
            {t('profile.title')}
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
                    {t('profile.personalInfo')}
                  </Typography>
                </Box>

                <AvatarUploader user={user} />

                <Box component="form" onSubmit={handleProfileSubmit}>
                  <TextField
                    fullWidth
                    label={t('auth.displayName')}
                    value={profileData.displayName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                    margin="normal"
                    size="small"
                  />

                  <TextField
                    fullWidth
                    label={t('profile.appName')}
                    value={profileData.appName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, appName: e.target.value }))}
                    placeholder={t('profile.appNamePlaceholder')}
                    margin="normal"
                    size="small"
                  />
                  <TextField
                    fullWidth
                    label={t('profile.appSlogan')}
                    value={profileData.appSlogan}
                    onChange={(e) => setProfileData(prev => ({ ...prev, appSlogan: e.target.value }))}
                    placeholder={t('profile.appSloganPlaceholder')}
                    margin="normal"
                    size="small"
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    sx={{ mt: 3 }}
                    disabled={updateProfile.isPending}
                  >
                    {updateProfile.isPending ? t('status.saving') : t('actions.save')}
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
                    {t('profile.preferences')}
                  </Typography>
                </Box>

                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('profile.theme')}</InputLabel>
                      <Select
                        value={prefsData.theme}
                        label={t('profile.theme')}
                        onChange={(e) => handlePrefsChange('theme', e.target.value)}
                      >
                        <MenuItem value="LIGHT">Clair / Light</MenuItem>
                        <MenuItem value="DARK">Sombre / Dark</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('profile.language')}</InputLabel>
                      <Select
                        value={prefsData.language}
                        label={t('profile.language')}
                        onChange={(e) => handlePrefsChange('language', e.target.value)}
                      >
                        <MenuItem value="FR">Français</MenuItem>
                        <MenuItem value="EN">English</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('profile.tempUnit')}</InputLabel>
                      <Select
                        value={prefsData.tempUnit}
                        label={t('profile.tempUnit')}
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
            <Grid container spacing={4} sx={{ mt: 0 }}>
              <Grid item xs={12} md={6}>
                <AccountSecurity user={user} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TwoFactorSettings user={user} />
              </Grid>
            </Grid>
          )}

        </Box>
      </Container>
    </MainLayout>
  );
}
