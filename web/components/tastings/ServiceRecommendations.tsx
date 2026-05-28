'use client';
import React from 'react';
import { Chip } from '@heroui/react';
import { Thermometer, Wind, Utensils } from 'lucide-react';
import { TastingItemSummary } from '@/lib/tastings/types';
import { getRecommendations } from '@/lib/tastings/recommendations';
import { useTranslation } from 'react-i18next';

interface ServiceRecommendationsProps {
  item: TastingItemSummary;
}

export function ServiceRecommendations({ item }: ServiceRecommendationsProps) {
  const { t } = useTranslation();
  const subtype = item.color ?? item.spiritType ?? item.sparklingType ?? null;
  const reco = getRecommendations(item.category, subtype);
  if (!reco) return null;

  return (
    <div className="bg-default-100 rounded-lg p-3 mt-1">
      <p className="text-xs font-semibold text-default-500 mb-2">
        {t('tastings.recommendations.title')}
      </p>
      <div className="flex flex-col gap-2">
        {/* Temperature */}
        <div className="flex items-center gap-2">
          <Thermometer size={16} className="text-default-400 shrink-0" />
          <span className="text-sm">
            {reco.tempMin}–{reco.tempMax}°C
          </span>
        </div>

        {/* Aeration */}
        {reco.aerationMin > 0 && (
          <div className="flex items-center gap-2">
            <Wind size={16} className="text-default-400 shrink-0" />
            <span className="text-sm">
              {t('tastings.recommendations.aeration', { min: reco.aerationMin, max: reco.aerationMax })}
            </span>
          </div>
        )}

        {/* Food pairings */}
        {reco.foodPairings.length > 0 && (
          <div className="flex items-start gap-2">
            <Utensils size={16} className="text-default-400 shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {reco.foodPairings.map((fp) => (
                <Chip key={fp} size="sm" variant="bordered">
                  {fp}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
