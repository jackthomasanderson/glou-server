'use client';
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IconButton, Badge, Menu, Box, Typography, Divider, List,
  ListItem, ListItemIcon, ListItemText, MenuItem,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { useHasMounted } from '@/hooks/useHasMounted';
import { InventoryItem } from '@/lib/inventory/types';

export function NotificationBell() {
  const { t } = useTranslation();
  const { data: items } = useInventory();
  const router = useRouter();
  const hasMounted = useHasMounted();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const alertItems = useMemo(() => {
    if (!items || !hasMounted) return [];
    const today = new Date().toISOString().split('T')[0];
    return items.filter((b: InventoryItem) => b.reminderDate && b.reminderDate.split('T')[0] <= today);
  }, [items, hasMounted]);

  const count = alertItems.length;

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    if (count > 0) setAnchorEl(e.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const handleViewAll = () => {
    handleClose();
    router.push('/inventory?filter=alerts');
  };

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen} size="small">
        <Badge badgeContent={hasMounted ? count : 0} color="error">
          <NotificationsIcon fontSize="small" />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 300, maxHeight: 360 } }}
      >
        <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {t('inventory.alerts.title')}
          </Typography>
        </Box>
        <Divider />
        <List dense disablePadding>
          {alertItems.map((item) => (
            <ListItem
              key={item.id}
              button
              onClick={handleViewAll}
              sx={{ py: 0.75 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <NotificationsIcon color="error" sx={{ fontSize: 16 }} />
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
        <MenuItem onClick={handleViewAll} sx={{ justifyContent: 'center', py: 1 }}>
          <Typography variant="caption" color="primary" fontWeight={700}>
            {t('inventory.alerts.viewAll')}
          </Typography>
        </MenuItem>
      </Menu>
    </>
  );
}
