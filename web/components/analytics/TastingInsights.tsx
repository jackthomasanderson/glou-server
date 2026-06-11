'use client';
import React from 'react';
import { Card, CardBody } from '@heroui/react';
import { Star, Wine, TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTastingAnalytics } from '@/hooks/useTastings';
import { TastingReadiness, TastingItemRank } from '@/lib/tastings/types';

const READINESS_ORDER: TastingReadiness[] = ['TOO_YOUNG', 'PERFECT', 'PEAK', 'PAST'];
const READINESS_COLOR: Record<TastingReadiness, string> = {
  TOO_YOUNG: '#6B7280',
  PERFECT: '#22C55E',
  PEAK: '#F59E0B',
  PAST: '#EF4444',
};

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={11}
          className={value >= s ? 'text-warning' : 'text-default-200'}
          fill={value >= s ? 'currentColor' : 'none'}
        />
      ))}
      <span className="text-xs font-bold ml-1">{value}</span>
    </div>
  );
}

function ItemRankRow({ item, rank }: { item: TastingItemRank; rank: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-divider last:border-b-0">
      <span className="text-[0.65rem] font-bold text-default-300 w-4 shrink-0">#{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{item.name}</p>
        <p className="text-[0.65rem] text-default-400 truncate">{item.producer}</p>
      </div>
      <div className="shrink-0 text-right">
        <StarRating value={item.avgRating} />
        <p className="text-[0.6rem] text-default-400">{item.count}×</p>
      </div>
    </div>
  );
}

export function TastingInsights() {
  const { t } = useTranslation();
  const { data, isLoading } = useTastingAnalytics();

  if (isLoading) {
    return (
      <Card className="border border-default-200" shadow="none">
        <CardBody className="p-5 h-48">
          <div className="h-full bg-default-100 rounded-xl animate-pulse" />
        </CardBody>
      </Card>
    );
  }

  const hasData =
    data &&
    (data.producerRankings.length > 0 ||
      data.topItems.length > 0 ||
      Object.values(data.readinessDistribution).some((v) => v > 0));

  if (!hasData) {
    return (
      <Card className="border border-default-200" shadow="none">
        <CardBody className="p-5 flex flex-col items-center justify-center gap-2 min-h-[120px]">
          <Wine size={24} className="text-default-300" />
          <p className="text-sm text-default-400 text-center">
            {t('analytics.tastingInsights.empty')}
          </p>
        </CardBody>
      </Card>
    );
  }

  const totalReadiness = Object.values(data!.readinessDistribution).reduce((s, v) => s + v, 0);

  return (
    <Card className="border border-default-200" shadow="none">
      <CardBody className="p-5">
        <div className="flex items-center gap-2 mb-5">
          <Wine size={18} className="text-primary" />
          <p className="text-[0.7rem] font-bold uppercase tracking-wider">
            {t('analytics.tastingInsights.title')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Producer rankings */}
          {data!.producerRankings.length > 0 && (
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-wider text-default-400 mb-3">
                {t('analytics.tastingInsights.producers')}
              </p>
              {data!.producerRankings.slice(0, 5).map((p, i) => (
                <div key={p.producer} className="flex items-center gap-2 py-1.5 border-b border-divider last:border-b-0">
                  <span className="text-[0.65rem] font-bold text-default-300 w-4 shrink-0">#{i + 1}</span>
                  <span className="flex-1 text-xs font-semibold truncate">{p.producer}</span>
                  <div className="shrink-0">
                    <StarRating value={p.avgRating} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Top & flop items */}
          {(data!.topItems.length > 0 || data!.flopItems.length > 0) && (
            <div>
              {data!.topItems.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 mb-3">
                    <TrendingUp size={13} className="text-success" />
                    <p className="text-[0.62rem] font-bold uppercase tracking-wider text-default-400">
                      {t('analytics.tastingInsights.topItems')}
                    </p>
                  </div>
                  {data!.topItems.slice(0, 3).map((item, i) => (
                    <ItemRankRow key={item.id} item={item} rank={i + 1} />
                  ))}
                </>
              )}
              {data!.flopItems.length > 0 && data!.flopItems[0]?.id !== data!.topItems[0]?.id && (
                <>
                  <div className="flex items-center gap-1.5 mt-4 mb-3">
                    <TrendingDown size={13} className="text-danger" />
                    <p className="text-[0.62rem] font-bold uppercase tracking-wider text-default-400">
                      {t('analytics.tastingInsights.flopItems')}
                    </p>
                  </div>
                  {data!.flopItems.slice(0, 3).map((item, i) => (
                    <ItemRankRow key={item.id} item={item} rank={i + 1} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Readiness distribution */}
          {totalReadiness > 0 && (
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-wider text-default-400 mb-3">
                {t('analytics.tastingInsights.readiness')}
              </p>
              {READINESS_ORDER.map((key) => {
                const count = data!.readinessDistribution[key];
                const pct = totalReadiness > 0 ? Math.round((count / totalReadiness) * 100) : 0;
                return (
                  <div key={key} className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-[0.72rem]" style={{ color: READINESS_COLOR[key] }}>
                        {t(`tastings.readiness.${key}`)}
                      </span>
                      <span className="text-[0.72rem] font-semibold text-default-500">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-default-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: READINESS_COLOR[key] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
