'use client';
import React from 'react';
import { Tooltip } from '@heroui/react';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useTranslation } from 'react-i18next';

export function ConnectivityIndicator() {
  const isOnline = useConnectivity();
  const { pendingCount, syncingCount, failedCount, conflictCount, hasPendingWork } = useOfflineSync();
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

  // FEAT-16/23: surface the offline sync queue's state alongside the raw
  // connectivity dot — "synchronisation en cours" / "X en attente".
  const syncLines: string[] = [];
  if (syncingCount > 0) syncLines.push(t('connectivity.sync.inProgress'));
  if (pendingCount > 0) syncLines.push(t('connectivity.sync.pending', { count: pendingCount }));
  if (failedCount > 0) syncLines.push(t('connectivity.sync.failed', { count: failedCount }));
  if (conflictCount > 0) syncLines.push(t('connectivity.sync.conflict', { count: conflictCount }));

  const tooltipContent = [label, subtitle, ...syncLines].filter(Boolean).join(' — ');
  const badgeCount = pendingCount + syncingCount + failedCount + conflictCount;
  const badgeColor = failedCount > 0 || conflictCount > 0 ? 'bg-danger' : 'bg-warning';

  return (
    <Tooltip content={tooltipContent} color="foreground" delay={500}>
      <span className="relative inline-flex items-center gap-1 flex-shrink-0 cursor-default" aria-label={tooltipContent}>
        <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
        {hasPendingWork && (
          <span
            className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[0.6rem] font-bold leading-none text-white ${badgeColor} ${
              syncingCount > 0 ? 'animate-pulse' : ''
            }`}
          >
            {badgeCount}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
