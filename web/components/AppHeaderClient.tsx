"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "../lib/i18n/I18nProvider";
import { useAuth } from "../lib/auth/AuthContext";
import { fetchAppSettings, updateMyProfile } from "../lib/profile/client";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Divider,
  Tooltip,
  Badge,
  useTheme,
  Button,
} from "@mui/material";
import {
  Notifications as BellIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  ExitToApp as LogoutIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  SettingsBrightness as AutoModeIcon,
  Language as LanguageIcon,
} from "@mui/icons-material";
import { AlertBadge } from "./AlertBadge";

export function AppHeaderClient() {
  const { t, locale, setLocale } = useTranslations();
  const { user, isAuthenticated, isLoading, logout, refreshMe } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [isHydrated, setIsHydrated] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchAppSettings,
    staleTime: 30_000,
  });

  const queryClient = useQueryClient();

  const themeMutation = useMutation({
    mutationFn: (mode: "light" | "dark" | "auto") => updateMyProfile({ themeMode: mode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
      refreshMe?.();
    },
  });

  const localeMutation = useMutation({
    mutationFn: (loc: "en" | "fr") => updateMyProfile({ preferredLocale: loc }),
    onSuccess: (data) => {
      if (data.preferredLocale) {
        setLocale(data.preferredLocale);
        queryClient.invalidateQueries({ queryKey: ["profile", "me"] });
        refreshMe?.();
      }
    },
  });

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const toggleLocale = (newLocale: "en" | "fr") => {
    setLocale(newLocale);
    if (isAuthenticated) {
      localeMutation.mutate(newLocale);
    }
  };

  const setThemeMode = (mode: "light" | "dark" | "auto") => {
    themeMutation.mutate(mode);
  };

  if (!isHydrated) {
    return <Box sx={{ height: 64 }} />;
  }

  const avatarLabel = (user?.displayName?.trim()?.[0] || user?.username?.trim()?.[0] || "?").toUpperCase();
  const brandTitle = appSettings?.appName?.trim() || t("app.title");
  const brandSubtitle = appSettings?.appTagline?.trim() || t("app.subtitle");

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
  };

  const goTo = (href: string) => {
    handleMenuClose();
    router.push(href);
  };

  return (
    <AppBar position="sticky" elevation={0} sx={{
      backgroundColor: 'background.paper',
      borderBottom: '1px solid',
      borderColor: 'divider',
      color: 'text.primary',
      display: { xs: 'none', md: 'block' }
    }}>
      <Toolbar sx={{ justifyContent: "space-between", px: { xs: 2, md: 3 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, md: 2 }, cursor: 'pointer' }} onClick={() => router.push("/")}>
          {appSettings?.logoUrl ? (
            <Box
              component="img"
              src={appSettings.logoUrl}
              alt={brandTitle}
              sx={{ width: { xs: 28, md: 32 }, height: { xs: 28, md: 32 }, borderRadius: 1 }}
            />
          ) : null}
          <Box>
            <Typography variant="h6" component="h1" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: { xs: '1rem', md: '1.25rem' } }}>
              {brandTitle}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', display: { xs: 'none', sm: 'block' } }}>
              {brandSubtitle}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {isAuthenticated && !isLoading && (
            <>
              <AlertBadge />

              <Tooltip title={t("header.userMenu.label")}>
                <IconButton onClick={handleMenuOpen} sx={{ ml: 1, p: 0.5 }}>
                  <Avatar
                    src={user?.avatarUrl || undefined}
                    sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontWeight: 600, fontSize: '0.875rem' }}
                  >
                    {!user?.avatarUrl && avatarLabel}
                  </Avatar>
                </IconButton>
              </Tooltip>

              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                PaperProps={{
                  sx: {
                    minWidth: 220,
                    mt: 1.5,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    border: '1px solid',
                    borderColor: 'divider',
                  }
                }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              >
                <MenuItem onClick={() => goTo("/profile")}>
                  <SettingsIcon sx={{ mr: 2, fontSize: 20, color: 'text.secondary' }} />
                  {t("pageTitles.settings")}
                </MenuItem>
                <MenuItem onClick={() => goTo("/security")}>
                  <SecurityIcon sx={{ mr: 2, fontSize: 20, color: 'text.secondary' }} />
                  {t("header.userMenu.security")}
                </MenuItem>

                <Divider sx={{ my: 1 }} />

                <Box sx={{ px: 2, py: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', mb: 1, display: 'block' }}>
                    {t("header.theme")}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title={t("header.lightMode")}>
                      <IconButton
                        size="small"
                        onClick={() => setThemeMode("light")}
                        sx={{
                          bgcolor: user?.themeMode === 'light' ? 'action.selected' : 'transparent',
                          color: user?.themeMode === 'light' ? 'primary.main' : 'text.secondary'
                        }}
                      >
                        <LightModeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("header.darkMode")}>
                      <IconButton
                        size="small"
                        onClick={() => setThemeMode("dark")}
                        sx={{
                          bgcolor: user?.themeMode === 'dark' ? 'action.selected' : 'transparent',
                          color: user?.themeMode === 'dark' ? 'primary.main' : 'text.secondary'
                        }}
                      >
                        <DarkModeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("header.autoMode")}>
                      <IconButton
                        size="small"
                        onClick={() => setThemeMode("auto")}
                        sx={{
                          bgcolor: user?.themeMode === 'auto' || !user?.themeMode ? 'action.selected' : 'transparent',
                          color: user?.themeMode === 'auto' || !user?.themeMode ? 'primary.main' : 'text.secondary'
                        }}
                      >
                        <AutoModeIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>

                <Divider sx={{ my: 1 }} />

                <Box sx={{ px: 2, py: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', mb: 1, display: 'block' }}>
                    {t("header.language")}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      onClick={() => toggleLocale("fr")}
                      sx={{
                        minWidth: 40,
                        fontWeight: 700,
                        bgcolor: locale === 'fr' ? 'action.selected' : 'transparent',
                        color: locale === 'fr' ? 'primary.main' : 'text.secondary'
                      }}
                    >
                      FR
                    </Button>
                    <Button
                      size="small"
                      onClick={() => toggleLocale("en")}
                      sx={{
                        minWidth: 40,
                        fontWeight: 700,
                        bgcolor: locale === 'en' ? 'action.selected' : 'transparent',
                        color: locale === 'en' ? 'primary.main' : 'text.secondary'
                      }}
                    >
                      EN
                    </Button>
                  </Box>
                </Box>

                <Divider sx={{ my: 1 }} />

                <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                  <LogoutIcon sx={{ mr: 2, fontSize: 20 }} />
                  {t("auth.logout")}
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
