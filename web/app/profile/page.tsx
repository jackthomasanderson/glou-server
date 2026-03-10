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
    tempUnit: 'CELSIUS' as 'CELSIUS' | 'FAHRENHEIT',
    dateFormat: 'SYSTEM' as 'SYSTEM' | 'H24' | 'H12',
    accentColor: '#6366f1'
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
        theme: user.theme || 'LIGHT',
        language: user.language || 'FR',
        tempUnit: user.tempUnit || 'CELSIUS',
        dateFormat: user.dateFormat || 'SYSTEM',
        accentColor: user.accentColor || '#6366f1'
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
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
                  <Box display="flex" alignItems="center" gap={1.5}>
                    <PersonIcon color="primary" />
                    <Typography variant="h6" fontWeight={600}>
                      {t('profile.personalInfo')}
                    </Typography>
                  </Box>
                  {user && (
                    <Box
                      sx={{
                        px: 1.5, py: 0.5,
                        borderRadius: 2,
                        bgcolor: user.isAdmin ? 'primary.main' : 'background.default',
                        color: user.isAdmin ? 'primary.contrastText' : 'text.secondary',
                        border: user.isAdmin ? 'none' : '1px solid',
                        borderColor: 'divider',
                        typography: 'caption',
                        fontWeight: 'bold'
                      }}
                    >
                      {user.isAdmin ? 'Admin' : 'Utilisateur'}
                    </Box>
                  )}
                </Box>

                {user && <AvatarUploader user={user} />}

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

                  <Grid item xs={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('profile.dateFormat')}</InputLabel>
                      <Select
                        value={prefsData.dateFormat}
                        label={t('profile.dateFormat')}
                        onChange={(e) => handlePrefsChange('dateFormat', e.target.value)}
                      >
                        <MenuItem value="SYSTEM">{t('profile.dateFormats.SYSTEM')}</MenuItem>
                        <MenuItem value="H24">{t('profile.dateFormats.H24')}</MenuItem>
                        <MenuItem value="H12">{t('profile.dateFormats.H12')}</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {t('profile.accentColor')}
                    </Typography>
                    <Box display="flex" gap={1.5} flexWrap="wrap">
                      {[
                        { name: 'indigo', val: '#6366f1' },
                        { name: 'rose', val: '#f43f5e' },
                        { name: 'amber', val: '#f59e0b' },
                        { name: 'emerald', val: '#10b981' },
                        { name: 'cyan', val: '#06b6d4' },
                        { name: 'violet', val: '#8b5cf6' },
                      ].map((c) => (
                        <Box
                          key={c.val}
                          onClick={() => handlePrefsChange('accentColor', c.val)}
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            bgcolor: c.val,
                            cursor: 'pointer',
                            border: '3px solid',
                            borderColor: prefsData.accentColor === c.val ? 'primary.main' : 'transparent',
                            boxShadow: prefsData.accentColor === c.val ? 2 : 0,
                            transition: 'all 0.2s',
                            '&:hover': { transform: 'scale(1.1)' }
                          }}
                          title={t(`profile.colors.${c.name}`)}
                        />
                      ))}
                    </Box>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 5, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    Les changements de thème et de langue s&apos;appliquent instantanément et sont sauvegardés sur votre compte.
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
