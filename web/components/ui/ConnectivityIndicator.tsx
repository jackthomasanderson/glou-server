'use client';
import React from 'react';
import { Tooltip } from '@heroui/react';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useTranslation } from 'react-i18next';

export function ConnectivityIndicator() {
  const isOnline = useConnectivity();
  const { t } = useTranslation();

  const color =
    isOnline === null ? 'bg-default-400' : isOnline ? 'bg-success' : 'bg-warning';
  const label =
    isOnline === null
      ? t('connectivity.checking')
      : isOnline
      ? t('connectivity.online')
      : t('connectivity.offline');
  const subtitle = isOnline === false ? t('connectivity.featuresAffected') : '';

  return (
    <Tooltip
      content={subtitle ? `${label} — ${subtitle}` : label}
      color="foreground"
      delay={500}
    >
      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 cursor-default ${color}`} />
    </Tooltip>
  );
}
