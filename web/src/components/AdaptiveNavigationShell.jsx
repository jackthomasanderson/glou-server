import React, { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppConfig } from '../context/AppConfigContext';
import {
  Box,
  AppBar,
  Toolbar,
  Drawer,
  BottomNavigation,
  BottomNavigationAction,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme,
  useMediaQuery,
  IconButton,
  TextField,
  InputAdornment,
  Typography,
  alpha,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  Dashboard as DashboardIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  AccountCircle as AccountCircleIcon,
  LocalDrink as WineIcon,
  Inventory as CaveIcon,
  History as HistoryIcon,
  Notifications as AlertsIcon,
  AdminPanelSettings as AdminIcon,
  Inventory,
} from '@mui/icons-material';

/**
 * Adaptive Navigation Shell - Collection Privée
 * Personal & Family Wine/Tobacco Collection Management
 * Clean, modern UI with optimized responsive design
 * - Mobile (< 600px): Bottom Navigation Bar
 * - Tablet (600px - 960px): Navigation Rail
 * - Desktop (> 960px): Permanent Drawer
 * 
 * Navigation Structure (Prioritized):
 * 1. Ma Cave (Home/Dashboard)
 * 2. Analyse (Heatmaps & Insights)
 * 3. Mes Dégustations (Tasting History)
 * 4. Alertes Apogée (Peak drinking alerts)
 * 5. Gestion Avancée (Admin - Discreet, bottom of menu)
 */
export const AdaptiveNavigationShell = ({ children }) => {
  const theme = useTheme();
  const location = useLocation();
  const { appName } = useAppConfig();
  const userLang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.toLowerCase() : 'en';
  const isFr = userLang.startsWith('fr');
  const t = (fr, en) => (isFr ? fr : en);
  const isCompact = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isMedium = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600px - 960px
  const isLarge = useMediaQuery(theme.breakpoints.up('md')); // > 960px
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Get current page from path
  const currentPage = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith('/analytics')) return 'analytics';
    if (path.startsWith('/alerts')) return 'alerts';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/user')) return 'user';
    if (path.startsWith('/cave')) return 'cave';
    if (path.startsWith('/wines')) return 'wines';
    if (path.startsWith('/tobacco')) return 'tobacco';
    if (path.startsWith('/tasting-history')) return 'tasting-history';
    return 'dashboard';
  }, [location.pathname]);

  // Navigation items with routes - Reorganized for "Collection Privée"
  // Priority order: Dashboard -> Caves -> Bouteilles -> Tabac -> Analyse -> Dégustations -> Alertes -> Gestion Avancée (at bottom)
  const navItems = [
    { id: 'dashboard', label: t('Tableau de bord', 'Dashboard'), icon: <DashboardIcon />, path: '/dashboard', section: 'primary' },
    { id: 'cave', label: t('Caves', 'Cellars'), icon: <CaveIcon />, path: '/cave', section: 'primary' },
    { id: 'wines', label: t('Bouteilles', 'Bottles'), icon: <WineIcon />, path: '/wines', section: 'primary' },
    { id: 'tobacco', label: t('Tabac', 'Tobacco'), icon: <Inventory />, path: '/tobacco', section: 'primary' },
    { id: 'analytics', label: t('Analyse', 'Analysis'), icon: <AnalyticsIcon />, path: '/analytics', section: 'primary' },
    { id: 'tasting-history', label: t('Mes Dégustations', 'Tastings'), icon: <HistoryIcon />, path: '/tasting-history', section: 'primary' },
    { id: 'alerts', label: t('Apogée', 'Peak Alerts'), icon: <AlertsIcon />, path: '/alerts', section: 'primary' },
    { id: 'admin', label: t('Gestion Avancée', 'Advanced Settings'), icon: <AdminIcon />, path: '/admin', section: 'secondary' },
    { id: 'user', label: t('Mon Profil', 'My Profile'), icon: <AccountCircleIcon />, path: '/user', section: 'secondary' },
  ];

  // Mobile: Bottom Navigation Bar
  if (isCompact) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Top App Bar */}
        <AppBar position="static" elevation={0} sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Toolbar sx={{ minHeight: 56 }}>
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
              {appName}
            </Typography>
            <IconButton color="inherit" size="small" sx={{ marginRight: 1 }}>
              <NotificationsIcon />
            </IconButton>
            <IconButton color="inherit" size="small" component={Link} to="/user">
              <AccountCircleIcon />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', paddingBottom: '40px' }}>
          {children}
        </Box>

        {/* Bottom Navigation Bar */}
        <BottomNavigation
          value={currentPage}
          onChange={(event, newValue) => {
            // Navigation is handled by Link component
          }}
          sx={{
            backgroundColor: theme.palette.surface,
            borderTop: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            boxShadow: `0 -1px 3px ${alpha(theme.palette.onSurface, 0.05)}`,
          }}
        >
          {navItems.slice(0, 5).map((item) => (
            <BottomNavigationAction
              key={item.id}
              icon={item.icon}
              label={item.label}
              value={item.id}
              selected={currentPage === item.id}
              component={Link}
              to={item.path}
              sx={{
                color:
                  currentPage === item.id
                    ? theme.palette.primary.main
                    : theme.palette.action.disabled,
                '&.Mui-selected': {
                  color: theme.palette.primary.main,
                },
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'none',
                },
              }}
            />
          ))}
        </BottomNavigation>
      </Box>
    );
  }

  // Tablet: Navigation Rail
  if (isMedium) {
    return (
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* Navigation Rail */}
        <Box
          sx={{
            width: 80,
            backgroundColor: theme.palette.surface,
            borderRight: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingY: 2,
            boxShadow: `1px 0 3px ${alpha(theme.palette.onSurface, 0.05)}`,
          }}
        >
          {navItems.slice(0, 6).map((item) => (
            <Box
              key={item.id}
              component={Link}
              to={item.path}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textDecoration: 'none',
                padding: 1.5,
                borderRadius: '12px',
                marginY: 1,
                color:
                  currentPage === item.id
                    ? theme.palette.primary.main
                    : theme.palette.action.disabled,
                backgroundColor:
                  currentPage === item.id
                    ? `${theme.palette.primary.main}15`
                    : 'transparent',
                transition: 'all 0.3s ease',
                '&:hover': {
                  backgroundColor: `${theme.palette.primary.main}10`,
                },
              }}
            >
              {item.icon}
              <Typography variant="caption" sx={{ marginTop: 0.5 }}>
                {item.label.substring(0, 3)}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Content Column */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top App Bar */}
          <AppBar position="static" elevation={0}>
            <Toolbar>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                {appName}
              </Typography>
              <IconButton color="inherit" size="small">
                <NotificationsIcon />
              </IconButton>
              <IconButton color="inherit" size="small" component={Link} to="/user">
                <AccountCircleIcon />
              </IconButton>
            </Toolbar>
          </AppBar>

          {/* Content */}
          <Box sx={{ flex: 1, overflow: 'auto', paddingBottom: '40px' }}>
            {children}
          </Box>
        </Box>
      </Box>
    );
  }

  // Desktop: Permanent Navigation Drawer
  if (isLarge) {
    return (
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* Permanent Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            width: 256,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              backgroundColor: theme.palette.surface,
              width: 256,
              boxSizing: 'border-box',
              borderRight: `1px solid ${alpha(theme.palette.onSurface, 0.12)}`,
              boxShadow: `1px 0 3px ${alpha(theme.palette.onSurface, 0.05)}`,
            },
          }}
        >
          {/* Header */}
          <Box sx={{ padding: 2 }}>
            <Typography
              variant="h6"
              sx={{
                color: theme.palette.primary.main,
                fontWeight: 600,
              }}
            >
              {appName}
            </Typography>
          </Box>
          <Divider sx={{ borderColor: alpha(theme.palette.onSurface, 0.12), marginX: 1 }} />

          {/* Navigation Items - Organized by sections */}
          <List sx={{ paddingY: 2, flex: 1 }}>
            {/* Primary items */}
            {navItems.filter(item => item.section === 'primary').map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  selected={currentPage === item.id}
                  component={Link}
                  to={item.path}
                  sx={{
                    marginX: 1,
                    marginY: 0.5,
                    borderRadius: '10px',
                    backgroundColor:
                      currentPage === item.id
                        ? alpha(theme.palette.primary.main, 0.1)
                        : 'transparent',
                    color:
                      currentPage === item.id
                        ? theme.palette.primary.main
                        : theme.palette.onSurfaceVariant,
                    textDecoration: 'none',
                    border:
                      currentPage === item.id
                        ? `1.5px solid ${theme.palette.primary.main}`
                        : 'none',
                    fontWeight: currentPage === item.id ? 600 : 500,
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.08),
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: 'inherit',
                      minWidth: 40,
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: currentPage === item.id ? 600 : 500,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          {/* Divider */}
          <Divider sx={{ borderColor: alpha(theme.palette.onSurface, 0.12), marginX: 1 }} />

          {/* Secondary items (Settings, Profile) - at bottom */}
          <List sx={{ paddingY: 2 }}>
            {navItems.filter(item => item.section === 'secondary').map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  selected={currentPage === item.id}
                  component={Link}
                  to={item.path}
                  sx={{
                    marginX: 1,
                    marginY: 0.5,
                    borderRadius: '10px',
                    backgroundColor:
                      currentPage === item.id
                        ? alpha(theme.palette.primary.main, 0.1)
                        : 'transparent',
                    color:
                      currentPage === item.id
                        ? theme.palette.primary.main
                        : theme.palette.onSurfaceVariant,
                    textDecoration: 'none',
                    border:
                      currentPage === item.id
                        ? `1.5px solid ${theme.palette.primary.main}`
                        : 'none',
                    fontWeight: currentPage === item.id ? 600 : 500,
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.08),
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: 'inherit',
                      minWidth: 40,
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: currentPage === item.id ? 600 : 500,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>

        {/* Content Column */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top App Bar (Medium) */}
          <AppBar position="static" elevation={0}>
            <Toolbar>
              <Typography variant="h5" sx={{ flexGrow: 1 }}>
                Dashboard
              </Typography>
              <TextField
                placeholder="Rechercher..."
                variant="outlined"
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: 300,
                  marginRight: 2,
                }}
              />
              <IconButton color="inherit">
                <NotificationsIcon />
              </IconButton>
              <IconButton color="inherit" component={Link} to="/user">
                <AccountCircleIcon />
              </IconButton>
            </Toolbar>
          </AppBar>

          {/* Content */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              backgroundColor: theme.palette.background.default,
              paddingBottom: '40px',
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    );
  }

  return null;
};

/**
 * Medium TopAppBar with scroll state management
 * Collapses/transforms based on scroll position
 * 
 * Design Tokens Used:
 * - surface: AppBar background
 * - primary/onPrimary: Title and actions
 * - outlineVariant: Bottom border
 */
export const SaasTopAppBar = ({
  title,
  onSearch,
  actions = [],
  scrolled = false,
}) => {
  const theme = useTheme();

  return (
    <AppBar
      position="sticky"
      elevation={scrolled ? 1 : 0}
      sx={{
        backgroundColor: theme.palette.surface,
        color: theme.palette.onSurface,
        borderBottom: scrolled ? 'none' : `1px solid ${theme.palette.divider}`,
        transition: 'all 0.3s ease-in-out',
        paddingY: scrolled ? 1 : 2,
      }}
    >
      <Toolbar>
        <Typography
          variant={scrolled ? 'h6' : 'h5'}
          sx={{
            flexGrow: 1,
            fontWeight: 500,
            transition: 'all 0.3s ease-in-out',
          }}
        >
          {title}
        </Typography>

        {/* Search Bar */}
        <TextField
          placeholder="Search..."
          variant="outlined"
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{
            width: 250,
            marginRight: 2,
          }}
        />

        {/* Custom Actions */}
        {actions.map((action, index) => (
          <IconButton key={index} color="inherit" onClick={action.onClick}>
            {action.icon}
          </IconButton>
        ))}

        {/* Notifications & Profile */}
        <IconButton color="inherit">
          <NotificationsIcon />
        </IconButton>
        <IconButton color="inherit">
          <AccountCircleIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
};
