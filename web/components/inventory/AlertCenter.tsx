'use client';
import React, { useState } from 'react';
import { Chip, Skeleton, Tooltip, Button } from '@heroui/react';
import { Bell, BellOff, ChevronDown, ChevronUp } from 'lucide-react';
import { useAlerts, useToggleAlertPause } from '@/hooks/useAlerts';
import { AlertBottle } from '@/lib/alerts/client';

const STATUS_COLOR: Record<string, 'danger' | 'success' | 'primary' | 'default'> = {
  past: 'danger',
  peak: 'success',
  approaching: 'primary',
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
      <div className="border border-default-200 rounded-xl p-4 mb-6">
        <Skeleton className="rounded w-48 h-8 mb-3" />
        <Skeleton className="rounded w-full h-16" />
      </div>
    );
  }

  if (!alerts || alerts.length === 0) return null;

  const pastCount = alerts.filter((a) => a.alertStatus === 'past').length;
  const peakCount = alerts.filter((a) => a.alertStatus === 'peak').length;

  const headerBg =
    pastCount > 0
      ? 'bg-danger'
      : peakCount > 0
      ? 'bg-success'
      : 'bg-primary';

  return (
    <div className="border border-default-200 rounded-xl overflow-hidden mb-6">
      {/* Header */}
      <button
        type="button"
        className={`w-full flex items-center justify-between px-4 py-3 text-white cursor-pointer ${headerBg}`}
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Bell size={18} />
          <span className="text-sm font-bold">
            {t('alerts.title')} ({alerts.length})
          </span>
          {pastCount > 0 && (
            <Chip
              size="sm"
              classNames={{ base: 'bg-white/25', content: 'text-white text-xs' }}
            >
              {t('alerts.pastCount', { count: pastCount })}
            </Chip>
          )}
          {peakCount > 0 && (
            <Chip
              size="sm"
              classNames={{ base: 'bg-white/25', content: 'text-white text-xs' }}
            >
              {t('alerts.peakCount', { count: peakCount })}
            </Chip>
          )}
        </div>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {/* Alert list */}
      {isOpen && (
        <ul className="divide-y divide-default-100">
          {alerts.map((bottle: AlertBottle) => (
            <li
              key={bottle.id}
              className={`flex items-center justify-between px-4 py-3 gap-3${
                bottle.alertStatus === 'past' ? ' bg-danger-50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-sm font-semibold truncate">{bottle.name}</span>
                  <span className="text-sm text-default-400 truncate">
                    {bottle.producer}
                    {bottle.vintage ? ` · ${bottle.vintage}` : ''}
                  </span>
                  <Chip
                    size="sm"
                    color={STATUS_COLOR[bottle.alertStatus ?? 'none'] ?? 'default'}
                  >
                    {t(`inventory.alertStatus.${bottle.alertStatus ?? 'none'}`)}
                  </Chip>
                </div>
                {bottle.peakMaturityFrom && bottle.peakMaturityTo && (
                  <p className="text-xs text-default-400 mt-0.5">
                    {t('alerts.window')}: {bottle.peakMaturityFrom} – {bottle.peakMaturityTo}
                  </p>
                )}
              </div>

              <Tooltip
                content={bottle.alertsPaused ? t('alerts.resumeAlert') : t('alerts.pauseAlert')}
                delay={500}
              >
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color={bottle.alertsPaused ? 'default' : 'primary'}
                  onPress={() => togglePause.mutate(bottle.id)}
                  isDisabled={togglePause.isPending}
                  aria-label={bottle.alertsPaused ? t('alerts.resumeAlert') : t('alerts.pauseAlert')}
                  className="shrink-0"
                >
                  {bottle.alertsPaused ? <BellOff size={16} /> : <Bell size={16} />}
                </Button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
