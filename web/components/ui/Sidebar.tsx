'use client';
import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Box, Typography, List, ListItem, ListItemButton, ListItemIcon,
  ListItemText, Avatar, Divider, SwipeableDrawer, Tooltip, Badge, IconButton,
} from '@mui/material';
import {
  Liquor as BottleIcon,
  Warehouse as CellarIcon,
  Grass as GrassIcon,
  CollectionsBookmark as CollectionsIcon,
  LocalBar as TastingsIcon,
  BarChart as AnalyticsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';
import { useCellars } from '@/hooks/useCellars';
import { useCollections } from '@/hooks/useCollections';
import { useHasMounted } from '@/hooks/useHasMounted';
import { ConnectivityIndicator } from './ConnectivityIndicator';

export const SIDEBAR_WIDTH = 220;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

const STORAGE_KEY = 'glou-sidebar-expanded';

interface SidebarContentProps {
  expanded: boolean;
  onToggle: () => void;
}

function SidebarContent({ expanded, onToggle }: SidebarContentProps) {
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
    { label: t('nav.analytics'), href: '/analytics', icon: <AnalyticsIcon sx={{ fontSize: 18 }} />, count: 0 },
  ];

  const labelSx = {
    overflow: 'hidden',
    maxWidth: expanded ? 200 : 0,
    opacity: expanded ? 1 : 0,
    transition: 'max-width 0.2s ease, opacity 0.15s ease',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Brand + toggle */}
      <Box
        sx={{
          px: expanded ? 3 : 0,
          pt: 3,
          pb: 2,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: expanded ? 'space-between' : 'center',
          transition: 'padding 0.2s ease',
        }}
      >
        {/* Brand text — fades out on collapse */}
        <Box sx={{ overflow: 'hidden', maxWidth: expanded ? 160 : 0, opacity: expanded ? 1 : 0, transition: 'max-width 0.2s ease, opacity 0.15s ease' }}>
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
              whiteSpace: 'nowrap',
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
              whiteSpace: 'nowrap',
            }}
          >
            {user?.appSlogan || 'Simplement précieux'}
          </Typography>
        </Box>

        {/* Toggle button */}
        <Tooltip title={expanded ? t('nav.collapse', 'Réduire') : t('nav.expand', 'Développer')} placement="right">
          <IconButton
            size="small"
            onClick={onToggle}
            sx={{
              flexShrink: 0,
              color: 'text.secondary',
              borderRadius: 1.5,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {expanded ? <ChevronLeftIcon sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Navigation */}
      <List sx={{ px: 1, pt: 0, flex: 1 }}>
        {navLinks.map((link) => {
          const active = pathname.startsWith(link.href);
          const showCount = hasMounted && link.count > 0;

          return (
            <ListItem key={link.href} disablePadding sx={{ mb: 0.25 }}>
              <Tooltip title={!expanded ? link.label : ''} placement="right" arrow>
                <ListItemButton
                  component={Link}
                  href={link.href}
                  selected={active}
                  sx={{
                    borderRadius: 2,
                    py: 0.875,
                    px: expanded ? 1.5 : 0,
                    justifyContent: expanded ? 'flex-start' : 'center',
                    transition: 'padding 0.2s ease',
                    minWidth: 0,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': { bgcolor: 'primary.dark' },
                      '& .MuiListItemIcon-root': { color: 'inherit' },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: expanded ? 1.25 : 0,
                      color: active ? 'inherit' : 'text.secondary',
                      transition: 'margin 0.2s ease',
                      justifyContent: 'center',
                    }}
                  >
                    {/* Badge for count in collapsed mode */}
                    {!expanded && showCount ? (
                      <Badge
                        badgeContent={link.count}
                        color={active ? 'default' : 'primary'}
                        max={99}
                        sx={{
                          '& .MuiBadge-badge': {
                            fontSize: '0.55rem',
                            minWidth: 15,
                            height: 15,
                            padding: '0 3px',
                            ...(active && { bgcolor: 'rgba(255,255,255,0.9)', color: 'primary.main' }),
                          },
                        }}
                      >
                        {link.icon}
                      </Badge>
                    ) : link.icon}
                  </ListItemIcon>

                  {/* Label — slides out on collapse */}
                  <Box sx={labelSx}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: active ? 600 : 400, lineHeight: 1 }}>
                      {link.label}
                    </Typography>
                  </Box>

                  {/* Count badge — expanded mode */}
                  {expanded && showCount && (
                    <Box
                      sx={{
                        ml: 0.75,
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        bgcolor: active ? 'rgba(255,255,255,0.25)' : 'action.selected',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        px: 0.75,
                        flexShrink: 0,
                      }}
                    >
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, lineHeight: 1 }}>
                        {link.count}
                      </Typography>
                    </Box>
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      {/* User footer */}
      <Divider />
      <Tooltip
        title={!expanded ? `${user?.username ?? ''} · ${user?.isAdmin ? 'Admin' : 'User'}` : ''}
        placement="right"
      >
        <Box
          sx={{
            px: expanded ? 2 : 0,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: expanded ? 1 : 0,
            justifyContent: expanded ? 'flex-start' : 'center',
            transition: 'padding 0.2s ease',
          }}
        >
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

          {/* Name + role — fades out on collapse */}
          <Box sx={{ ...labelSx, flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap' }} noWrap>
              {user?.username}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.3, whiteSpace: 'nowrap' }} noWrap>
              {user?.isAdmin ? 'Administrateur' : 'Utilisateur'}
            </Typography>
          </Box>

          {expanded && <ConnectivityIndicator />}
        </Box>
      </Tooltip>
    </Box>
  );
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose = () => {} }: SidebarProps) {
  const [expanded, setExpanded] = useState(true);

  // Sync from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setExpanded(saved !== 'false');
  }, []);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const desktopWidth = expanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  return (
    <>
      {/* Desktop: permanent, in document flow */}
      <Box
        component="nav"
        sx={{
          width: desktopWidth,
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
          transition: 'width 0.2s ease',
        }}
      >
        <SidebarContent expanded={expanded} onToggle={toggle} />
      </Box>

      {/* Mobile: overlay drawer — always expanded */}
      <SwipeableDrawer
        anchor="left"
        open={mobileOpen}
        onClose={onMobileClose}
        onOpen={() => {}}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            boxSizing: 'border-box',
            border: 'none',
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          },
        }}
      >
        <SidebarContent expanded={true} onToggle={onMobileClose} />
      </SwipeableDrawer>
    </>
  );
}
