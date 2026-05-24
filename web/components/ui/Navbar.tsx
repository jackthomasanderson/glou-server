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
} from '@mui/material';
import {
  Liquor as BottleIcon,
  Warehouse as CellarIcon,
  Logout as LogoutIcon,
  Notifications as NotificationsIcon,
} from '@mui/icons-material';
import { GlobalSearch } from './GlobalSearch';
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

  const navLinks = [
    { label: t('nav.bottles'), href: '/inventory', icon: <BottleIcon /> },
    { label: t('nav.caves'), href: '/cellars', icon: <CellarIcon /> },
  ];

  if (!hasMounted) return null;

  return (
    <AppBar position="sticky" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary' }}>

      <Container maxWidth="lg">
        <Toolbar disableGutters>
          <Typography
            variant="h6"
            noWrap
            component={Link}
            href="/"
            sx={{
              mr: 4,
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
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
          </Box>
        </Toolbar>
      </Container>
      {renderMenu}
    </AppBar>
  );
};
