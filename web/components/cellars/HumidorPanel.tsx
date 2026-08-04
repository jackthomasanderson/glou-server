'use client';

import React, { useState } from 'react';
import { Button, Input, Chip, CircularProgress } from '@heroui/react';
import { Droplets, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHumidorHistory, useRecordHumidorReading, HumidorDriftStatus } from '@/hooks/useHumidor';

interface HumidorPanelProps {
  cellarId: string;
}

const DRIFT_COLOR: Record<HumidorDriftStatus, 'success' | 'danger' | 'default'> = {
  in_range: 'success',
  out_of_range: 'danger',
  unconfigured: 'default',
};

/**
 * Task 4 (data-model audit) — cigar humidor hygrometric monitoring, "Mode
 * expert" only. Deliberately simple ("reste simple, pas de dashboard
 * complexe" per the product decision): a status chip, a small history
 * sparkline, the last few readings, and a quick manual-entry form. No chart
 * library — a hand-rolled SVG polyline, same convention already used
 * elsewhere in this codebase (see analytics/GardeHistogram.tsx) rather than
 * pulling a new dependency for one small add-on panel.
 */
export function HumidorPanel({ cellarId }: HumidorPanelProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useHumidorHistory(cellarId);
  const recordMutation = useRecordHumidorReading(cellarId);
  const [humidity, setHumidity] = useState('');
  const [temp, setTemp] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(humidity);
    if (!humidity.trim() || Number.isNaN(h)) return;
    recordMutation.mutate(
      { humidityPercent: h, temperatureCelsius: temp.trim() ? Number(temp) : null },
      { onSuccess: () => { setHumidity(''); setTemp(''); } },
    );
  };

  if (isLoading) {
    return (
      <div className="bg-content1 border border-divider rounded-2xl p-5 mt-6 flex justify-center">
        <CircularProgress size="sm" color="primary" />
      </div>
    );
  }
  if (!data) return null;

  const readingsChrono = [...data.readings].reverse(); // oldest → newest for the sparkline

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-5 mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplets size={16} className="text-primary" />
          <h2 className="text-sm font-semibold">{t('cellars.humidor.title')}</h2>
        </div>
        <Chip size="sm" variant="flat" color={DRIFT_COLOR[data.drift]}>
          {t(`cellars.humidor.status.${data.drift}`)}
        </Chip>
      </div>

      {(data.cellar.targetHumidityMin == null || data.cellar.targetHumidityMax == null) && (
        <p className="text-xs text-foreground-400 mb-3">{t('cellars.humidor.noTargetHint')}</p>
      )}

      {data.latest && (
        <p className="text-xs text-foreground-500 mb-3">
          {t('cellars.humidor.latestReading', {
            humidity: data.latest.humidityPercent,
            date: new Date(data.latest.recordedAt).toLocaleString(),
          })}
        </p>
      )}

      {readingsChrono.length > 1 && (
        <HumidityChart
          readings={readingsChrono}
          targetMin={data.cellar.targetHumidityMin}
          targetMax={data.cellar.targetHumidityMax}
        />
      )}

      {data.readings.length === 0 ? (
        <p className="text-sm text-foreground-400 py-4 text-center">{t('cellars.humidor.empty')}</p>
      ) : (
        <div className="mt-1 flex flex-col gap-1 max-h-48 overflow-y-auto">
          {data.readings.slice(0, 10).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs border-b border-divider py-1 last:border-b-0">
              <span className="text-foreground-400 shrink-0">{new Date(r.recordedAt).toLocaleString()}</span>
              <span className="font-semibold flex-1 text-right">
                {r.humidityPercent}%{r.temperatureCelsius != null ? ` · ${r.temperatureCelsius}°C` : ''}
              </span>
              <Chip size="sm" variant="flat" className="h-4 px-1.5 text-[0.6rem] shrink-0">
                {t(`cellars.humidor.source.${r.source}`)}
              </Chip>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 mt-4 pt-4 border-t border-divider">
        <Input
          label={t('cellars.humidor.humidityPercent')}
          type="number" min={0} max={100} size="sm" variant="bordered"
          value={humidity} onValueChange={setHumidity}
          isRequired
        />
        <Input
          label={t('cellars.humidor.temperatureCelsius')}
          type="number" size="sm" variant="bordered"
          value={temp} onValueChange={setTemp}
        />
        <Button
          type="submit" size="sm" color="primary" isIconOnly
          isLoading={recordMutation.isPending}
          isDisabled={!humidity.trim()}
          aria-label={t('cellars.humidor.addReading')}
        >
          <Plus size={16} />
        </Button>
      </form>
    </div>
  );
}

function HumidityChart({
  readings, targetMin, targetMax,
}: {
  readings: { humidityPercent: number }[];
  targetMin: number | null;
  targetMax: number | null;
}) {
  const width = 280;
  const height = 56;
  const values = readings.map((r) => r.humidityPercent);
  const lo = Math.min(...values, targetMin ?? Infinity) - 2;
  const hi = Math.max(...values, targetMax ?? -Infinity) + 2;
  const range = Math.max(hi - lo, 1);

  const points = readings
    .map((r, i) => {
      const x = readings.length > 1 ? (i / (readings.length - 1)) * width : 0;
      const y = height - ((r.humidityPercent - lo) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const bandTop = targetMax != null ? height - ((targetMax - lo) / range) * height : null;
  const bandBottom = targetMin != null ? height - ((targetMin - lo) / range) * height : null;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="mb-3" preserveAspectRatio="none">
      {bandTop != null && bandBottom != null && (
        <rect x={0} y={bandTop} width={width} height={Math.max(bandBottom - bandTop, 1)} fill="rgba(16,185,129,0.12)" />
      )}
      <polyline points={points} fill="none" stroke="#006FEE" strokeWidth={2} />
    </svg>
  );
}
