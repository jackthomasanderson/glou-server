'use client';
import React from 'react';
import { Tooltip } from '@heroui/react';
import { WifiOff } from 'lucide-react';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useTranslation } from 'react-i18next';

/**
 * Connection + offline-sync status, rendered once in the page header so it is
 * visible at every screen size (#195: it used to live in the desktop sidebar
 * only, so on a phone — where the network is worst — nothing said that edits
 * were still waiting to be sent).
 *
 * It is a real focusable button (#205): the full status was only a mouse-hover
 * tooltip on a plain <span>, unreachable by keyboard or touch. Offline is shown
 * with an icon and a short label, not by colour alone, and changes are
 * announced through a polite live region.
 */
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
  const offline = isOnline === false;

  return (
    <span className="inline-flex items-center flex-shrink-0">
    <Tooltip content={tooltipContent} color="foreground" delay={500}>
      <button
        type="button"
        aria-label={tooltipContent}
        className="relative inline-flex items-center gap-1 flex-shrink-0 rounded-full px-1 py-1 text-foreground-500 outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {offline ? (
          <WifiOff size={14} className="text-warning" aria-hidden="true" />
        ) : (
          <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden="true" />
        )}
        {offline && (
          <span className="hidden sm:inline text-xs font-semibold" aria-hidden="true">
            {t('connectivity.offline')}
          </span>
        )}
        {hasPendingWork && (
          <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-xs font-bold leading-none text-white ${badgeColor} ${
              syncingCount > 0 ? 'animate-pulse' : ''
            }`}
          >
            {badgeCount}
          </span>
        )}
      </button>
    </Tooltip>
    {/* Outside the button: its children are presentational, so a live region
        inside it would never be announced. */}
    <span role="status" className="sr-only">{tooltipContent}</span>
    </span>
  );
}
