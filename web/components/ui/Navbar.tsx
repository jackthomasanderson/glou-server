'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Divider,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Liquor as BottleIcon,
  Warehouse as CellarIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useLogout, useMe } from '@/hooks/useAuth';

export const Navbar: React.FC = () => {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const logoutMutation = useLogout();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);


  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };


  const handleMenuClose = () => {
    setAnchorEl(null);
  };

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
        <Typography variant="subtitle2">{user?.displayName || user?.username}</Typography>
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
    { label: t('nav.bottles'), href: '/bottles', icon: <BottleIcon /> },
    { label: t('nav.caves'), href: '/cellars', icon: <CellarIcon /> },
  ];

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
            <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
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

          <Box sx={{ flexGrow: isMobile ? 1 : 0 }} />

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
                {!user?.avatarUrl && (user?.displayName || user?.username || '?')[0].toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </Container>
      {renderMenu}
    </AppBar>
  );
};
