'use client';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Box, Typography, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Avatar, Divider, SwipeableDrawer,
} from '@mui/material';
import {
  Liquor as BottleIcon,
  Warehouse as CellarIcon,
  Grass as GrassIcon,
  CollectionsBookmark as CollectionsIcon,
  LocalBar as TastingsIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';
import { useCellars } from '@/hooks/useCellars';
import { useCollections } from '@/hooks/useCollections';
import { useHasMounted } from '@/hooks/useHasMounted';
import { ConnectivityIndicator } from './ConnectivityIndicator';

export const SIDEBAR_WIDTH = 220;

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function SidebarContent() {
  const { t } = useTranslation();
  const { data: user } = useMe();
  const { data: items } = useInventory();
  const { data: cellars } = useCellars();
  const { data: collections } = useCollections();
  const pathname = usePathname();
  const hasMounted = useHasMounted();

  const bottleCount = useMemo(
    () => items?.filter(i => ['wine', 'sparkling', 'spirit'].includes(i.category)).length ?? 0,
    [items]
  );
  const cigarCount = useMemo(
    () => items?.filter(i => i.category === 'cigar').length ?? 0,
    [items]
  );

  const navLinks = [
    { label: t('nav.bottles'), href: '/inventory', icon: <BottleIcon sx={{ fontSize: 18 }} />, count: bottleCount },
    { label: t('nav.cigars'), href: '/cigars', icon: <GrassIcon sx={{ fontSize: 18 }} />, count: cigarCount },
    { label: t('nav.caves'), href: '/cellars', icon: <CellarIcon sx={{ fontSize: 18 }} />, count: cellars?.length ?? 0 },
    { label: t('nav.collections'), href: '/collections', icon: <CollectionsIcon sx={{ fontSize: 18 }} />, count: collections?.length ?? 0 },
    { label: t('nav.tastings'), href: '/tastings', icon: <TastingsIcon sx={{ fontSize: 18 }} />, count: 0 },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Brand */}
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        <Typography
          component={Link}
          href="/"
          sx={{
            display: 'block',
            fontWeight: 800,
            fontSize: '1.1rem',
            letterSpacing: '.15rem',
            color: 'secondary.main',
            textDecoration: 'none',
            lineHeight: 1.1,
          }}
        >
          {user?.appName || 'GLOU'}
        </Typography>
        <Typography
          sx={{
            display: 'block',
            fontSize: '0.6rem',
            letterSpacing: '.08rem',
            textTransform: 'uppercase',
            color: 'text.secondary',
            mt: 0.25,
          }}
        >
          {user?.appSlogan || 'Simplement précieux'}
        </Typography>
      </Box>

      {/* Navigation */}
      <List sx={{ px: 1.5, pt: 0, flex: 1 }}>
        {navLinks.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <ListItem key={link.href} disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                component={Link}
                href={link.href}
                selected={active}
                sx={{
                  borderRadius: 2,
                  py: 0.875,
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '&:hover': { bgcolor: 'primary.dark' },
                    '& .MuiListItemIcon-root': { color: 'inherit' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 34, color: active ? 'inherit' : 'text.secondary' }}>
                  {link.icon}
                </ListItemIcon>
                <ListItemText
                  primary={link.label}
                  primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: active ? 600 : 400 }}
                />
                {hasMounted && link.count > 0 && (
                  <Box
                    sx={{
                      minWidth: 20,
                      height: 20,
                      borderRadius: 10,
                      bgcolor: active ? 'rgba(255,255,255,0.25)' : 'action.selected',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      px: 0.75,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, lineHeight: 1 }}>
                      {link.count}
                    </Typography>
                  </Box>
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* User footer */}
      <Divider />
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar
          src={user?.avatarUrl || undefined}
          component={Link}
          href="/profile"
          sx={{
            width: 32,
            height: 32,
            bgcolor: 'secondary.main',
            fontSize: '0.8rem',
            flexShrink: 0,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          {!user?.avatarUrl && (user?.username || '?')[0].toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, lineHeight: 1.3 }} noWrap>
            {user?.username}
          </Typography>
          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.3 }} noWrap>
            {user?.isAdmin ? 'Administrateur' : 'Utilisateur'}
          </Typography>
        </Box>
        <ConnectivityIndicator />
      </Box>
    </Box>
  );
}

const paperSx = {
  width: SIDEBAR_WIDTH,
  boxSizing: 'border-box' as const,
  border: 'none',
  borderRight: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
};

export function Sidebar({ mobileOpen = false, onMobileClose = () => {} }: SidebarProps) {
  return (
    <>
      {/* Desktop: permanent, in document flow */}
      <Box
        component="nav"
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          height: '100vh',
          position: 'sticky',
          top: 0,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
          zIndex: 'drawer',
        }}
      >
        <SidebarContent />
      </Box>

      {/* Mobile: overlay drawer */}
      <SwipeableDrawer
        anchor="left"
        open={mobileOpen}
        onClose={onMobileClose}
        onOpen={() => {}}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': paperSx,
        }}
      >
        <SidebarContent />
      </SwipeableDrawer>
    </>
  );
}
