'use client';

import React from 'react';
import {
  Card,
  CardBody,
  Chip,
} from '@heroui/react';
import {
  BarChart3,
  MapPin,
  Warehouse,
  CalendarDays,
  ShieldCheck,
  Euro,
  Droplets,
  CigaretteOff,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/components/ui/MainLayout';
import { useAnalytics } from '@/hooks/useAnalytics';
import { AnalyticsStats, CategoryStat, RegionStat, GardePoint, CavePoint } from '@/lib/analytics/types';
import dynamic from 'next/dynamic';
import { GardeHistogram } from './GardeHistogram';

// World map loaded client-side only (react-leaflet relies on browser APIs)
const WorldHeatmap = dynamic(
  () => import('./WorldHeatmap').then((m) => m.WorldHeatmap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] rounded-2xl bg-default-100 animate-pulse" />
    ),
  }
);

// ─── Valuation breakdown ──────────────────────────────────────────────────────

function ValuationBreakdown({
  totalValuation,
  totalPurchasePrice,
  t,
}: {
  totalValuation: number;
  totalPurchasePrice: number;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const delta = totalValuation - totalPurchasePrice;
  const roiPercent = totalPurchasePrice > 0 ? Math.round((delta / totalPurchasePrice) * 100) : null;
  const isPositive = delta >= 0;

  return (
    <Card className="border border-default-200" shadow="none">
      <CardBody className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Euro size={18} className="text-primary" />
          <p className="text-[0.7rem] font-bold uppercase tracking-wider">
            {t('analytics.valuation.title')}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-[0.62rem] font-bold uppercase tracking-wider text-default-400">
              {t('analytics.valuation.purchaseTotal')}
            </p>
            <p className="text-[1.4rem] font-extrabold leading-tight">
              {totalPurchasePrice} €
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-[0.62rem] font-bold uppercase tracking-wider text-default-400">
              {t('analytics.valuation.estimatedTotal')}
            </p>
            <p className="text-[1.4rem] font-extrabold leading-tight">
              {totalValuation} €
            </p>
          </div>
          {totalPurchasePrice > 0 && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[0.62rem] font-bold uppercase tracking-wider text-default-400">
                {t('analytics.valuation.roi')}
              </p>
              <div className="flex items-center gap-1.5">
                {isPositive
                  ? <TrendingUp size={16} className="text-success" />
                  : <TrendingDown size={16} className="text-danger" />}
                <p
                  className="text-[1.4rem] font-extrabold leading-tight"
                  style={{ color: isPositive ? '#22C55E' : '#EF4444' }}
                >
                  {isPositive ? '+' : ''}{delta} €
                </p>
                {roiPercent !== null && (
                  <span
                    className="text-[0.7rem] font-bold"
                    style={{ color: isPositive ? '#22C55E' : '#EF4444' }}
                  >
                    ({isPositive ? '+' : ''}{roiPercent}%)
                  </span>
                )}
              </div>
              <p className="text-[0.68rem] text-default-400">
                {t('analytics.valuation.roiHint')}
              </p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { color: string }> = {
  wine:      { color: '#7B1E30' },
  sparkling: { color: '#2563EB' },
  spirit:    { color: '#D97706' },
  cigar:     { color: '#5C3D2E' },
};

// ─── SVG Donut chart ──────────────────────────────────────────────────────────

function DonutChart({
  segments,
  total,
  centerLabel,
}: {
  segments: { value: number; color: string }[];
  total: number;
  centerLabel?: string;
}) {
  const cx = 60, cy = 60, r = 46, strokeWidth = 14;
  const circumference = 2 * Math.PI * r;
  let cumulativePercent = 0;

  return (
    <svg width={120} height={120} viewBox="0 0 120 120" style={{ display: 'block' }}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(128,128,128,0.12)"
        strokeWidth={strokeWidth}
      />
      {total > 0 &&
        segments.map((seg, i) => {
          const percent = seg.value / total;
          if (percent <= 0) return null;
          const dash = percent * circumference;
          const rotation = cumulativePercent * 360 - 90;
          cumulativePercent += percent;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              transform={`rotate(${rotation}, ${cx}, ${cy})`}
              strokeLinecap="butt"
            />
          );
        })}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor">
        {total}
      </text>
      {centerLabel && (
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize="8"
          fill="currentColor"
          opacity="0.55"
          letterSpacing="0.5"
        >
          {centerLabel.toUpperCase()}
        </text>
      )}
    </svg>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  hint,
  icon,
  iconBg,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <Card className="h-full border border-default-200" shadow="none">
      <CardBody className="p-5">
        <div className="flex justify-between items-start gap-2">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-default-500">
              {label}
            </p>
            <p className="text-[1.75rem] font-extrabold leading-tight mt-1">{value}</p>
            <p className="text-[0.72rem] text-default-400 mt-1">• {hint}</p>
          </div>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: iconBg }}
          >
            {icon}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="border border-default-200" shadow="none">
      <CardBody className="p-5">
        <div className="h-3 w-3/5 bg-default-200 rounded animate-pulse" />
        <div className="h-8 w-2/5 bg-default-200 rounded animate-pulse mt-2" />
        <div className="h-2.5 w-4/5 bg-default-100 rounded animate-pulse mt-2" />
      </CardBody>
    </Card>
  );
}

// ─── Category breakdown ───────────────────────────────────────────────────────

function CategoryBreakdown({
  items,
  total,
  t,
}: {
  items: CategoryStat[];
  total: number;
  t: (k: string) => string;
}) {
  const segments = items.map((item) => ({
    value: item.count,
    color: CATEGORY_CONFIG[item.category]?.color ?? '#888',
  }));

  return (
    <Card className="h-full border border-default-200" shadow="none">
      <CardBody className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={18} className="text-primary" />
          <p className="text-[0.7rem] font-bold uppercase tracking-wider">
            {t('analytics.categories.title')}
          </p>
        </div>
        <div className="flex gap-6 items-center">
          <DonutChart
            segments={segments}
            total={total}
            centerLabel={t('analytics.categories.active')}
          />
          <div className="flex-1 min-w-0">
            {items.map((item) => {
              const cfg = CATEGORY_CONFIG[item.category];
              const unit = t(`analytics.categories.unit.${item.category}`);
              return (
                <div key={item.category} className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cfg?.color ?? '#888' }}
                  />
                  <span className="text-[0.75rem] flex-1 min-w-0 truncate">
                    {t(`analytics.categories.${item.category}`)}
                  </span>
                  <span className="text-[0.75rem] font-semibold text-default-500 shrink-0">
                    {item.count} {unit}
                  </span>
                </div>
              );
            })}
            {items.length === 0 && (
              <p className="text-[0.75rem] text-default-400">{t('status.empty')}</p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-default-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Maturity planning ────────────────────────────────────────────────────────

function MaturityPlanning({
  stats,
  t,
}: {
  stats: AnalyticsStats;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const { maturityPlanning, cigarModulesCount } = stats;
  const currentYear = new Date().getFullYear();

  const rows = [
    {
      label: t('analytics.maturity.readyNow'),
      count: maturityPlanning.readyNow.count,
      percent: maturityPlanning.readyNow.percent,
      color: '#D97706',
    },
    {
      label: t('analytics.maturity.preserve'),
      count: maturityPlanning.preserve.count,
      percent: maturityPlanning.preserve.percent,
      color: 'rgba(128,128,128,0.35)',
    },
    {
      label: t('analytics.maturity.pastPeak'),
      count: maturityPlanning.pastPeak.count,
      percent: maturityPlanning.pastPeak.percent,
      color: 'rgba(128,128,128,0.2)',
    },
  ];

  return (
    <Card className="h-full border border-default-200" shadow="none">
      <CardBody className="p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-primary" />
            <p className="text-[0.7rem] font-bold uppercase tracking-wider">
              {t('analytics.maturity.title')}
            </p>
          </div>
          <Chip
            size="sm"
            color="warning"
            className="text-[0.6rem] font-bold h-5"
          >
            {t('analytics.maturity.season', { year: `${currentYear}/${currentYear + 4}` })}
          </Chip>
        </div>
        <p className="text-[0.75rem] text-default-500 mb-5 leading-relaxed">
          {t('analytics.maturity.description')}
        </p>
        {rows.map((row) => (
          <div key={row.label} className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-[0.75rem] text-default-500">{row.label}</span>
              <span className="text-[0.75rem] font-semibold">
                {t('analytics.maturity.countLabel', { count: row.count, percent: row.percent })}
              </span>
            </div>
            <ProgressBar value={row.percent} color={row.color} />
          </div>
        ))}
        {cigarModulesCount > 0 && (
          <div className="flex items-start gap-2 mt-4 bg-default-50 rounded-xl p-3">
            <ShieldCheck size={16} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[0.7rem] font-bold">{t('analytics.maturity.humidorTip')}</p>
              <p className="text-[0.7rem] text-default-500 mt-0.5">
                {t('analytics.maturity.humidorTipText')}
              </p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─── Region cards ─────────────────────────────────────────────────────────────

function RegionCards({ regions, t }: { regions: RegionStat[]; t: (k: string) => string }) {
  if (regions.length === 0) return null;
  return (
    <div className="flex gap-3 flex-wrap">
      {regions.map((r) => (
        <Card key={r.region} className="min-w-[140px] shrink-0 border border-default-200" shadow="none">
          <CardBody className="p-4">
            <p className="text-[0.65rem] font-extrabold uppercase tracking-widest text-primary mb-1">
              {r.region}
            </p>
            <p className="text-[1.5rem] font-extrabold leading-tight">{r.count}</p>
            <p className="text-[0.7rem] text-default-400 mb-2">{t('analytics.regionMap.items')}</p>
            <div className="flex justify-between">
              <span className="text-[0.7rem] text-default-400">{t('analytics.regionMap.valuation')}</span>
              <span className="text-[0.7rem] font-bold">{r.valuation} €</span>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// ─── Garde planning section ───────────────────────────────────────────────────

function GardePlanningSection({
  data,
  t,
}: {
  data: GardePoint[];
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <Card className="border border-default-200" shadow="none">
      <CardBody className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={18} className="text-primary" />
          <div>
            <p className="text-[0.7rem] font-bold uppercase tracking-wider">
              {t('analytics.garde.title')}
            </p>
            <p className="text-[0.68rem] text-default-400">{t('analytics.garde.subtitle')}</p>
          </div>
        </div>
        <GardeHistogram data={data} t={t} />
      </CardBody>
    </Card>
  );
}

// ─── Cave distribution ────────────────────────────────────────────────────────

function CaveDistribution({ caves, t }: { caves: CavePoint[]; t: (k: string) => string }) {
  if (caves.length === 0) return null;
  const maxCount = Math.max(...caves.map((c) => c.count), 1);

  return (
    <Card className="h-full border border-default-200" shadow="none">
      <CardBody className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Warehouse size={18} className="text-primary" />
          <p className="text-[0.7rem] font-bold uppercase tracking-wider">
            {t('analytics.caves.title')}
          </p>
        </div>
        {caves.map((cave) => (
          <div key={cave.cellarId} className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-[0.75rem] font-semibold truncate">{cave.cellarName}</span>
              <span className="text-[0.75rem] text-default-500 shrink-0 ml-2">
                {cave.count} — {cave.valuation} €
              </span>
            </div>
            <ProgressBar value={(cave.count / maxCount) * 100} color="#006FEE" />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAnalytics();

  if (isError) {
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto py-6 px-4">
          <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-danger-700 text-sm">
            {t('status.error')}
          </div>
        </div>
      </MainLayout>
    );
  }

  const totalItems = data?.totalActiveItems ?? 0;
  const catItems = data?.categoryBreakdown ?? [];

  return (
    <MainLayout>
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">

      {/* Header */}
      <Card className="border border-default-200" shadow="none">
        <CardBody className="p-5">
          <div className="flex items-center gap-3">
            <BarChart3 size={20} className="text-primary" />
            <div>
              <h1 className="text-lg font-bold">{t('analytics.pageTitle')}</h1>
              <p className="text-[0.75rem] text-default-500">{t('analytics.pageSubtitle')}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label={t('analytics.stats.totalValuation')}
              value={`${data?.totalValuation ?? 0} €`}
              hint={t('analytics.stats.totalValuationHint')}
              icon={<Euro size={20} color="#2563EB" />}
              iconBg="rgba(37,99,235,0.1)"
            />
            <StatCard
              label={t('analytics.stats.liquidStock')}
              value={`${data?.totalLiquidLiters ?? 0} L`}
              hint={t('analytics.stats.liquidStockHint')}
              icon={<Droplets size={20} color="#0891B2" />}
              iconBg="rgba(8,145,178,0.1)"
            />
            <StatCard
              label={t('analytics.stats.cigarHumidor')}
              value={`${data?.cigarModulesCount ?? 0} modules`}
              hint={t('analytics.stats.cigarHumidorHint')}
              icon={<CigaretteOff size={20} color="#7B1E30" />}
              iconBg="rgba(123,30,48,0.1)"
            />
            <StatCard
              label={t('analytics.stats.urgentDegustation')}
              value={data?.urgentDegustationCount ?? 0}
              hint={t('analytics.stats.urgentDegustationHint')}
              icon={<AlertTriangle size={20} color="#D97706" />}
              iconBg="rgba(217,119,6,0.1)"
            />
          </>
        )}
      </div>

      {/* Valuation breakdown — only shown if there's purchase or estimated data */}
      {!isLoading && (data?.totalPurchasePrice ?? 0) > 0 && (
        <ValuationBreakdown
          totalValuation={data?.totalValuation ?? 0}
          totalPurchasePrice={data?.totalPurchasePrice ?? 0}
          t={t as (k: string, opts?: Record<string, unknown>) => string}
        />
      )}

      {/* World heatmap */}
      <Card className="border border-default-200" shadow="none">
        <CardBody className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-primary" />
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wider">
                {t('analytics.regionMap.mapTitle')}
              </p>
              <p className="text-[0.68rem] text-default-400">
                {t('analytics.regionMap.mapSubtitle')}
              </p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-[320px] rounded-2xl bg-default-100 animate-pulse" />
          ) : (
            <WorldHeatmap regions={data?.regionBreakdown ?? []} t={t} />
          )}
        </CardBody>
      </Card>

      {/* Region cards */}
      {isLoading ? (
        <Card className="border border-default-200" shadow="none">
          <CardBody className="p-5">
            <div className="flex gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="w-[140px] h-[110px] bg-default-100 rounded-2xl animate-pulse shrink-0" />
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (data?.regionBreakdown?.length ?? 0) > 0 ? (
        <Card className="border border-default-200" shadow="none">
          <CardBody className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-primary" />
              <p className="text-[0.7rem] font-bold uppercase tracking-wider">
                {t('analytics.regionMap.title')}
              </p>
              <span className="text-[0.7rem] text-default-400 ml-1">
                — {t('analytics.regionMap.subtitle')}
              </span>
            </div>
            <RegionCards regions={data?.regionBreakdown ?? []} t={t} />
          </CardBody>
        </Card>
      ) : null}

      {/* Garde planning histogram */}
      {(data?.gardeHistogram?.length ?? 0) > 0 && (
        <GardePlanningSection
          data={data?.gardeHistogram ?? []}
          t={t as (k: string, opts?: Record<string, unknown>) => string}
        />
      )}

      {/* Category donut + Maturity planning + Cave distribution */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4">
          {isLoading ? (
            <Card className="border border-default-200" shadow="none">
              <CardBody className="p-5 h-[280px]">
                <div className="h-full bg-default-100 rounded-xl animate-pulse" />
              </CardBody>
            </Card>
          ) : (
            <CategoryBreakdown items={catItems} total={totalItems} t={t} />
          )}
        </div>
        <div
          className={
            (data?.caveDistribution?.length ?? 0) > 0
              ? 'md:col-span-5'
              : 'md:col-span-8'
          }
        >
          {isLoading ? (
            <Card className="border border-default-200" shadow="none">
              <CardBody className="p-5 h-[280px]">
                <div className="h-full bg-default-100 rounded-xl animate-pulse" />
              </CardBody>
            </Card>
          ) : data ? (
            <MaturityPlanning
              stats={data}
              t={t as (k: string, opts?: Record<string, unknown>) => string}
            />
          ) : null}
        </div>
        {(data?.caveDistribution?.length ?? 0) > 0 && (
          <div className="md:col-span-3">
            <CaveDistribution caves={data?.caveDistribution ?? []} t={t} />
          </div>
        )}
      </div>
    </div>
    </MainLayout>
  );
}
