'use client';
import React, { useState } from 'react';
import {
  Box, Typography, Chip, IconButton, Skeleton, Collapse,
  List, ListItem, ListItemText, ListItemSecondaryAction,
  Tooltip, Paper, Stack, Divider,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAlerts, useToggleAlertPause } from '@/hooks/useAlerts';
import { AlertBottle } from '@/lib/alerts/client';

const STATUS_COLOR: Record<string, 'error' | 'success' | 'info' | 'default'> = {
  past: 'error',
  peak: 'success',
  approaching: 'info',
};

interface AlertCenterProps {
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function AlertCenter({ t }: AlertCenterProps) {
  const { data: alerts, isLoading } = useAlerts();
  const togglePause = useToggleAlertPause();
  const [isOpen, setIsOpen] = useState(true);

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Skeleton variant="text" width={200} height={32} />
        <Skeleton variant="rounded" height={60} sx={{ mt: 1 }} />
      </Paper>
    );
  }

  if (!alerts || alerts.length === 0) return null;

  const pastCount = alerts.filter((a) => a.alertStatus === 'past').length;
  const peakCount = alerts.filter((a) => a.alertStatus === 'peak').length;

  return (
    <Paper variant="outlined" sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          px: 2, py: 1.5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          bgcolor: pastCount > 0 ? 'error.main' : peakCount > 0 ? 'success.main' : 'info.main',
          color: 'white',
          cursor: 'pointer',
        }}
        onClick={() => setIsOpen((v) => !v)}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <NotificationsIcon />
          <Typography variant="subtitle1" fontWeight={700}>
            {t('alerts.title')} ({alerts.length})
          </Typography>
          {pastCount > 0 && (
            <Chip label={t('alerts.pastCount', { count: pastCount })} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: 'white' }} />
          )}
          {peakCount > 0 && (
            <Chip label={t('alerts.peakCount', { count: peakCount })} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.25)', color: 'white' }} />
          )}
        </Stack>
        {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </Box>

      {/* Alert list */}
      <Collapse in={isOpen}>
        <List dense disablePadding>
          {alerts.map((bottle: AlertBottle, idx: number) => (
            <React.Fragment key={bottle.id}>
              {idx > 0 && <Divider component="li" />}
              <ListItem
                sx={{
                  py: 1.5, px: 2,
                  bgcolor: bottle.alertStatus === 'past' ? 'error.50' : 'transparent',
                }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {bottle.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {bottle.producer}
                        {bottle.vintage ? ` · ${bottle.vintage}` : ''}
                      </Typography>
                      <Chip
                        label={t(`inventory.alertStatus.${bottle.alertStatus ?? 'none'}`)}
                        size="small"
                        color={STATUS_COLOR[bottle.alertStatus ?? 'none'] ?? 'default'}
                      />
                    </Stack>
                  }
                  secondary={
                    bottle.peakMaturityFrom && bottle.peakMaturityTo
                      ? `${t('alerts.window')}: ${bottle.peakMaturityFrom} – ${bottle.peakMaturityTo}`
                      : undefined
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title={bottle.alertsPaused ? t('alerts.resumeAlert') : t('alerts.pauseAlert')}>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => togglePause.mutate(bottle.id)}
                      disabled={togglePause.isPending}
                      color={bottle.alertsPaused ? 'default' : 'primary'}
                    >
                      {bottle.alertsPaused ? <NotificationsOffIcon fontSize="small" /> : <NotificationsIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      </Collapse>
    </Paper>
  );
}
