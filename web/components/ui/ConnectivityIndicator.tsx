'use client';
import React from 'react';
import { Box, Tooltip } from '@mui/material';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useTranslation } from 'react-i18next';

export function ConnectivityIndicator() {
  const isOnline = useConnectivity();
  const { t } = useTranslation();

  const color =
    isOnline === null ? '#9CA3AF' : isOnline ? '#10B981' : '#F59E0B';
  const label =
    isOnline === null
      ? t('connectivity.checking')
      : isOnline
      ? t('connectivity.online')
      : t('connectivity.offline');
  const subtitle =
    isOnline === false ? t('connectivity.featuresAffected') : '';

  return (
    <Tooltip title={subtitle ? `${label} — ${subtitle}` : label} arrow>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: color,
          cursor: 'default',
          flexShrink: 0,
        }}
      />
    </Tooltip>
  );
}
