'use client';
import React from 'react';
import { Star, Wine } from 'lucide-react';
import { Chip } from '@heroui/react';
import { useTastingItemStats } from '@/hooks/useTastings';
import { useTranslation } from 'react-i18next';
import { TastingReadiness } from '@/lib/tastings/types';

const READINESS_COLOR: Record<TastingReadiness, 'default' | 'success' | 'warning' | 'danger'> = {
  TOO_YOUNG: 'default',
  PERFECT: 'success',
  PEAK: 'warning',
  PAST: 'danger',
};

interface TastingStatsSummaryProps {
  itemId: string;
  onViewAll?: () => void;
}

export function TastingStatsSummary({ itemId, onViewAll }: TastingStatsSummaryProps) {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useTastingItemStats(itemId);

  if (isLoading) {
    return (
      <div className="p-3 bg-default-50 rounded-xl border border-divider animate-pulse h-16" />
    );
  }

  if (!stats) {
    return (
      <div className="p-3 bg-default-50 rounded-xl border border-divider flex items-center gap-2">
        <Wine size={14} className="text-default-300 shrink-0" />
        <p className="text-xs text-default-400 italic">{t('tastings.stats.empty')}</p>
      </div>
    );
  }

  return (
    <div className="p-3 bg-default-50 rounded-xl border border-divider space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {/* Count */}
          <div className="flex flex-col">
            <span className="text-[0.55rem] font-bold uppercase tracking-widest text-default-400">
              {t('tastings.stats.count')}
            </span>
            <span className="text-sm font-bold">{stats.count}</span>
          </div>

          {/* Avg rating */}
          {stats.avgRating != null && (
            <div className="flex flex-col">
              <span className="text-[0.55rem] font-bold uppercase tracking-widest text-default-400">
                {t('tastings.stats.avgRating')}
              </span>
              <div className="flex items-center gap-0.5">
                <Star size={12} className="text-warning" fill="currentColor" />
                <span className="text-sm font-bold">{stats.avgRating}</span>
              </div>
            </div>
          )}

          {/* Last tasted */}
          <div className="flex flex-col">
            <span className="text-[0.55rem] font-bold uppercase tracking-widest text-default-400">
              {t('tastings.stats.lastTasted')}
            </span>
            <span className="text-xs font-semibold">
              {new Date(stats.lastTastedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* View all link */}
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-[0.65rem] font-bold text-primary hover:underline shrink-0"
          >
            {t('tastings.stats.viewAll')}
          </button>
        )}
      </div>

      {/* Last readiness */}
      {stats.lastReadiness && (
        <Chip
          size="sm"
          variant="flat"
          color={READINESS_COLOR[stats.lastReadiness]}
          className="text-[0.65rem]"
        >
          {t(`tastings.readiness.${stats.lastReadiness}`)}
        </Chip>
      )}
    </div>
  );
}
