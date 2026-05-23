'use client';
import React from 'react';
import { Chip, Tooltip, Box, Typography } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

type AlertStatus = 'none' | 'approaching' | 'peak' | 'past';

interface DrinkingWindowBadgeProps {
  alertStatus?: AlertStatus | null;
  alertsPaused?: boolean;
  peakMaturityFrom?: number | null;
  peakMaturityTo?: number | null;
  t: (key: string) => string;
  size?: 'small' | 'medium';
}

const STATUS_CONFIG: Record<AlertStatus, { color: 'default' | 'info' | 'success' | 'error'; icon: React.ReactElement }> = {
  none: { color: 'default', icon: <AccessTimeIcon sx={{ fontSize: '1rem !important' }} /> },
  approaching: { color: 'info', icon: <AccessTimeIcon sx={{ fontSize: '1rem !important' }} /> },
  peak: { color: 'success', icon: <CheckCircleOutlineIcon sx={{ fontSize: '1rem !important' }} /> },
  past: { color: 'error', icon: <WarningAmberIcon sx={{ fontSize: '1rem !important' }} /> },
};

export function DrinkingWindowBadge({
  alertStatus,
  alertsPaused,
  peakMaturityFrom,
  peakMaturityTo,
  t,
  size = 'small',
}: DrinkingWindowBadgeProps) {
  const status: AlertStatus = alertsPaused ? 'none' : (alertStatus ?? 'none');

  if (status === 'none' && !peakMaturityFrom && !peakMaturityTo) return null;

  const config = STATUS_CONFIG[status];
  const windowLabel = peakMaturityFrom && peakMaturityTo
    ? `${peakMaturityFrom} – ${peakMaturityTo}`
    : peakMaturityFrom
    ? `${t('alerts.from')} ${peakMaturityFrom}`
    : peakMaturityTo
    ? `${t('alerts.until')} ${peakMaturityTo}`
    : '';

  const tooltipContent = (
    <Box>
      <Typography variant="caption" display="block" fontWeight={600}>
        {t(`inventory.alertStatus.${status}`)}
      </Typography>
      {windowLabel && (
        <Typography variant="caption" display="block" color="text.secondary">
          {windowLabel}
        </Typography>
      )}
      {alertsPaused && (
        <Typography variant="caption" display="block" color="text.disabled">
          {t('alerts.paused')}
        </Typography>
      )}
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow>
      <Chip
        icon={config.icon}
        label={windowLabel || t(`inventory.alertStatus.${status}`)}
        size={size}
        color={alertsPaused ? 'default' : config.color}
        variant={alertsPaused ? 'outlined' : 'filled'}
        sx={{ opacity: alertsPaused ? 0.6 : 1 }}
      />
    </Tooltip>
  );
}
