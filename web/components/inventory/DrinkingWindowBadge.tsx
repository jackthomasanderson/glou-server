'use client';
import React from 'react';
import { Chip, Tooltip } from '@heroui/react';
import { Clock, CheckCircle, AlertTriangle } from 'lucide-react';

type AlertStatus = 'none' | 'approaching' | 'peak' | 'past';

interface DrinkingWindowBadgeProps {
  alertStatus?: AlertStatus | null;
  alertsPaused?: boolean;
  peakMaturityFrom?: number | null;
  peakMaturityTo?: number | null;
  t: (key: string) => string;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<AlertStatus, { color: 'default' | 'primary' | 'success' | 'danger'; icon: React.ReactElement }> = {
  none: { color: 'default', icon: <Clock size={12} /> },
  approaching: { color: 'primary', icon: <Clock size={12} /> },
  peak: { color: 'success', icon: <CheckCircle size={12} /> },
  past: { color: 'danger', icon: <AlertTriangle size={12} /> },
};

export function DrinkingWindowBadge({
  alertStatus,
  alertsPaused,
  peakMaturityFrom,
  peakMaturityTo,
  t,
  size = 'sm',
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
    <div>
      <p className="text-xs font-semibold">{t(`inventory.alertStatus.${status}`)}</p>
      {windowLabel && <p className="text-xs text-foreground-400">{windowLabel}</p>}
      {alertsPaused && <p className="text-xs text-foreground-400">{t('alerts.paused')}</p>}
    </div>
  );

  return (
    <Tooltip content={tooltipContent} delay={500}>
      <Chip
        startContent={config.icon}
        size={size}
        color={alertsPaused ? 'default' : config.color}
        variant={alertsPaused ? 'bordered' : 'flat'}
        radius="full"
        className={alertsPaused ? 'opacity-60' : ''}
      >
        {windowLabel || t(`inventory.alertStatus.${status}`)}
      </Chip>
    </Tooltip>
  );
}
