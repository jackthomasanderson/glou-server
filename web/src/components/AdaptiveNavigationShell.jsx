import React, { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Drawer,
  NavigationBar,
  NavigationBarAction,
  Rail,
  RailAction,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme,
  useMediaQuery,
  IconButton,
  TextField,
  InputAdornment,
  Typography,
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
} from '@mui/icons-material';

/**
 * Adaptive Navigation Shell for MD3 SaaS
 * - Mobile (< 600px): Bottom Navigation Bar
 * - Tablet (600px - 960px): Navigation Rail
 * - Desktop (> 960px): Permanent Drawer
 * 
 * Design Tokens Used:
 * - surface: Navigation background
 * - primary/onPrimary: Selected item colors
 * - onSurfaceVariant: Unselected item colors
 * - outlineVariant: Dividers and borders
 */
export const AdaptiveNavigationShell = ({ children, currentPage, onPageChange }) => {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isMedium = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600px - 960px
  const isLarge = useMediaQuery(theme.breakpoints.up('md')); // > 960px
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Navigation items
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { id: 'analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  ];

  // Mobile: Bottom Navigation Bar
  if (isCompact) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Top App Bar */}
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Glou Analytics
            </Typography>
            <IconButton color="inherit" size="small">
              <NotificationsIcon />
            </IconButton>
            <IconButton color="inherit" size="small">
              <AccountCircleIcon />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {children}
        </Box>

        {/* Bottom Navigation Bar */}
        <NavigationBar
          sx={{
            backgroundColor: theme.palette.surface,
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          {navItems.map((item) => (
            <NavigationBarAction
              key={item.id}
              icon={item.icon}
              label={item.label}
              showLabel={true}
              selected={currentPage === item.id}
              onClick={() => onPageChange(item.id)}
              sx={{
                color:
                  currentPage === item.id
                    ? theme.palette.primary.main
                    : theme.palette.action.disabled,
                '&.Mui-selected': {
                  color: theme.palette.primary.main,
                },
              }}
            />
          ))}
        </NavigationBar>
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
            backgroundColor: theme.palette.surfaceLight,
            borderRight: `1px solid ${theme.palette.divider}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingY: 2,
          }}
        >
          {navItems.map((item) => (
            <RailAction
              key={item.id}
              icon={item.icon}
              label={item.label}
              selected={currentPage === item.id}
              onClick={() => onPageChange(item.id)}
              sx={{
                color:
                  currentPage === item.id
                    ? theme.palette.primary.main
                    : theme.palette.action.disabled,
                marginY: 1,
              }}
            />
          ))}
        </Box>

        {/* Content Column */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Top App Bar */}
          <AppBar position="static" elevation={0}>
            <Toolbar>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Glou Analytics
              </Typography>
              <IconButton color="inherit" size="small">
                <NotificationsIcon />
              </IconButton>
              <IconButton color="inherit" size="small">
                <AccountCircleIcon />
              </IconButton>
            </Toolbar>
          </AppBar>

          {/* Content */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
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
              backgroundColor: theme.palette.surfaceMedium,
              width: 256,
              boxSizing: 'border-box',
              borderRight: `1px solid ${theme.palette.divider}`,
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
              Glou Analytics
            </Typography>
          </Box>
          <Divider sx={{ borderColor: theme.palette.divider }} />

          {/* Navigation Items */}
          <List sx={{ paddingY: 2 }}>
            {navItems.map((item) => (
              <ListItem
                key={item.id}
                button
                selected={currentPage === item.id}
                onClick={() => onPageChange(item.id)}
                sx={{
                  marginX: 1,
                  marginY: 0.5,
                  borderRadius: '8px',
                  backgroundColor:
                    currentPage === item.id
                      ? theme.palette.primary.main
                      : 'transparent',
                  color:
                    currentPage === item.id
                      ? theme.palette.onPrimary
                      : theme.palette.onSurfaceVariant,
                  '&:hover': {
                    backgroundColor:
                      currentPage === item.id
                        ? theme.palette.primary.dark
                        : theme.palette.action.hover,
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
                    fontWeight: currentPage === item.id ? 500 : 400,
                  }}
                />
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
                  width: 300,
                  marginRight: 2,
                }}
              />
              <IconButton color="inherit">
                <NotificationsIcon />
              </IconButton>
              <IconButton color="inherit">
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
