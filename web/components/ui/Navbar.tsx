'use client';

import React, { useMemo } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  IconButton,
  Avatar,
  Divider,
  useTheme,
  useMediaQuery,
  Badge,
  Menu,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  SwipeableDrawer,
} from '@mui/material';
import {
  Liquor as BottleIcon,
  Warehouse as CellarIcon,
  Logout as LogoutIcon,
  Notifications as NotificationsIcon,
  Grass as GrassIcon,
  CollectionsBookmark as CollectionsIcon,
  LocalBar as TastingsIcon,
  Menu as MenuIcon,
  Person as PersonIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';
import { GlobalSearch } from './GlobalSearch';
import { ConnectivityIndicator } from './ConnectivityIndicator';
import { useTranslation } from 'react-i18next';
import { useLogout, useMe } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';

export const Navbar: React.FC = () => {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const logoutMutation = useLogout();
  const pathname = usePathname();
  const router = useRouter();
  const { data: items } = useInventory();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const hasMounted = useHasMounted();

  const alertsCount = useMemo(() => {
    if (!items || !hasMounted) return 0;
    const today = new Date().toISOString().split('T')[0];
    return items.filter(b => b.reminderDate && b.reminderDate.split('T')[0] <= today).length;
  }, [items, hasMounted]);

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [notifAnchorEl, setNotifAnchorEl] = React.useState<null | HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleNotifMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    if (alertsCount > 0) {
      setNotifAnchorEl(event.currentTarget);
    }
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setNotifAnchorEl(null);
  };

  const alertItems = useMemo(() => {
    if (!items || !hasMounted) return [];
    const today = new Date().toISOString().split('T')[0];
    return items.filter(b => b.reminderDate && b.reminderDate.split('T')[0] <= today);
  }, [items, hasMounted]);

  const navLinks = [
    { label: t('nav.bottles'), href: '/inventory', icon: <BottleIcon /> },
    { label: t('nav.cigars'), href: '/cigars', icon: <GrassIcon /> },
    { label: t('nav.caves'), href: '/cellars', icon: <CellarIcon /> },
    { label: t('nav.collections'), href: '/collections', icon: <CollectionsIcon /> },
    { label: t('nav.tastings'), href: '/tastings', icon: <TastingsIcon /> },
  ];

  const menuId = 'primary-search-account-menu';
  const renderMenu = (
    <Menu
      anchorEl={anchorEl}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      id={menuId}
      keepMounted
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      open={Boolean(anchorEl)}
      onClose={handleMenuClose}
    >
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="subtitle2">{user?.username}</Typography>
        <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
      </Box>
      <Divider />
      <MenuItem onClick={handleMenuClose} component={Link} href="/profile">
        {t('nav.profile')}
      </MenuItem>
      {user?.isAdmin && (
        <MenuItem onClick={handleMenuClose} component={Link} href="/admin">
          {t('nav.admin', 'Administration')}
        </MenuItem>
      )}
      <MenuItem onClick={() => { handleMenuClose(); logoutMutation.mutate(); }}>
        <Box display="flex" alignItems="center" gap={1}>
          <LogoutIcon fontSize="small" />
          {t('auth.logout')}
        </Box>
      </MenuItem>
    </Menu>
  );

  const mobileDrawer = (
    <SwipeableDrawer
      anchor="left"
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      onOpen={() => setDrawerOpen(true)}
      sx={{ display: { md: 'none' } }}
      PaperProps={{ sx: { width: 280 } }}
    >
      {/* User header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar
          src={user?.avatarUrl || undefined}
          sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontSize: '1rem' }}
        >
          {!user?.avatarUrl && (user?.username || '?')[0].toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={600} noWrap>{user?.username}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap display="block">{user?.email}</Typography>
        </Box>
      </Box>

      <Divider />

      {/* Main navigation */}
      <List sx={{ pt: 1, pb: 0 }}>
        {navLinks.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <ListItem key={link.href} disablePadding sx={{ px: 1 }}>
              <ListItemButton
                component={Link}
                href={link.href}
                selected={active}
                onClick={() => setDrawerOpen(false)}
                sx={{
                  borderRadius: 2,
                  '&.Mui-selected': { bgcolor: 'action.selected', fontWeight: 700 },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'text.secondary' }}>
                  {link.icon}
                </ListItemIcon>
                <ListItemText
                  primary={link.label}
                  primaryTypographyProps={{ fontWeight: active ? 700 : 400 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ mt: 1 }} />

      {/* Secondary: profile, admin, logout */}
      <List sx={{ pt: 1 }}>
        <ListItem disablePadding sx={{ px: 1 }}>
          <ListItemButton
            component={Link}
            href="/profile"
            onClick={() => setDrawerOpen(false)}
            sx={{ borderRadius: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}><PersonIcon /></ListItemIcon>
            <ListItemText primary={t('nav.profile')} />
          </ListItemButton>
        </ListItem>

        {user?.isAdmin && (
          <ListItem disablePadding sx={{ px: 1 }}>
            <ListItemButton
              component={Link}
              href="/admin"
              onClick={() => setDrawerOpen(false)}
              sx={{ borderRadius: 2 }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}><AdminIcon /></ListItemIcon>
              <ListItemText primary={t('nav.admin', 'Administration')} />
            </ListItemButton>
          </ListItem>
        )}

        <ListItem disablePadding sx={{ px: 1 }}>
          <ListItemButton
            onClick={() => { setDrawerOpen(false); logoutMutation.mutate(); }}
            sx={{ borderRadius: 2, color: 'error.main' }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}><LogoutIcon /></ListItemIcon>
            <ListItemText primary={t('auth.logout')} />
          </ListItemButton>
        </ListItem>
      </List>
    </SwipeableDrawer>
  );

  if (!hasMounted) return null;

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary' }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters>
            {/* Hamburger — mobile only */}
            {isMobile && (
              <IconButton
                edge="start"
                color="inherit"
                onClick={() => setDrawerOpen(true)}
                sx={{ mr: 1 }}
                aria-label="open navigation"
              >
                <MenuIcon />
              </IconButton>
            )}

            <Typography
              variant="h6"
              noWrap
              component={Link}
              href="/"
              sx={{
                mr: isMobile ? 1 : 4,
                display: 'flex',
                fontWeight: 700,
                color: 'inherit',
                textDecoration: 'none',
                letterSpacing: '.1rem',
              }}
            >
              {user?.appName || 'GLOU'}
            </Typography>

            {!isMobile && (
              <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
                {navLinks.map((link) => (
                  <Button
                    key={link.href}
                    component={Link}
                    href={link.href}
                    startIcon={link.icon}
                    color={pathname.startsWith(link.href) ? 'primary' : 'inherit'}
                    sx={{
                      fontWeight: pathname.startsWith(link.href) ? 700 : 400,
                      borderRadius: 2
                    }}
                  >
                    {link.label}
                  </Button>
                ))}
              </Box>
            )}

            <Box sx={{ flexGrow: 1 }} />

            <GlobalSearch />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
              {!isMobile && <ConnectivityIndicator />}
              <IconButton color="inherit" onClick={handleNotifMenuOpen}>
                <Badge badgeContent={alertsCount} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>

              <Menu
                anchorEl={notifAnchorEl}
                open={Boolean(notifAnchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{ sx: { width: 320, maxHeight: 400 } }}
              >
                <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    {t('inventory.alerts.title')}
                  </Typography>
                </Box>
                <Divider />
                <List sx={{ p: 0 }}>
                  {alertItems.map((item) => (
                    <ListItem
                      key={item.id}
                      button
                      onClick={() => {
                        handleMenuClose();
                        router.push('/inventory?filter=alerts');
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <NotificationsIcon color="error" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={item.name}
                        secondary={item.producer}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                </List>
                <Divider />
                <MenuItem
                  onClick={() => {
                    handleMenuClose();
                    router.push('/inventory?filter=alerts');
                  }}
                  sx={{ justifyContent: 'center', py: 1 }}
                >
                  <Typography variant="caption" color="primary" fontWeight="bold">
                    {t('inventory.alerts.viewAll')}
                  </Typography>
                </MenuItem>
              </Menu>

              {/* Avatar only on desktop — on mobile profile is in the drawer */}
              {!isMobile && (
                <IconButton
                  size="large"
                  edge="end"
                  aria-label="account of current user"
                  aria-controls={menuId}
                  aria-haspopup="true"
                  onClick={handleProfileMenuOpen}
                  color="inherit"
                >
                  <Avatar src={user?.avatarUrl || undefined} sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '1rem' }}>
                    {!user?.avatarUrl && (user?.username || '?')[0].toUpperCase()}
                  </Avatar>
                </IconButton>
              )}
            </Box>
          </Toolbar>
        </Container>
        {renderMenu}
      </AppBar>

      {mobileDrawer}
    </>
  );
};
