'use client';
import React, { Suspense } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, Skeleton,
  Chip, LinearProgress, Alert,
} from '@mui/material';
import {
  EuroRounded as EuroIcon,
  WaterDrop as WaterIcon,
  SmokingRooms as CigarIcon,
  WarningAmber as WarningIcon,
  BarChart as BarChartIcon,
  PublicOutlined as GlobeIcon,
  VerifiedUser as ShieldIcon,
  CalendarMonth as CalendarIcon,
  Warehouse as CellarIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/hooks/useAnalytics';
import { AnalyticsStats, CategoryStat, RegionStat, GardePoint, CavePoint } from '@/lib/analytics/types';
import dynamic from 'next/dynamic';
import { GardeHistogram } from './GardeHistogram';

// World map loaded client-side only (react-simple-maps relies on browser APIs)
const WorldHeatmap = dynamic(
  () => import('./WorldHeatmap').then(m => m.WorldHeatmap),
  { ssr: false, loading: () => <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 2 }} /> }
);

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { color: string }> = {
  wine:     { color: '#7B1E30' },
  sparkling:{ color: '#2563EB' },
  spirit:   { color: '#D97706' },
  cigar:    { color: '#5C3D2E' },
};

// ─── SVG Donut chart ──────────────────────────────────────────────────────────

function DonutChart({ segments, total, centerLabel }: {
  segments: { value: number; color: string }[];
  total: number;
  centerLabel?: string;
}) {
  const cx = 60, cy = 60, r = 46, strokeWidth = 14;
  const circumference = 2 * Math.PI * r;
  let cumulativePercent = 0;

  return (
    <svg width={120} height={120} viewBox="0 0 120 120" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(128,128,128,0.12)" strokeWidth={strokeWidth} />
      {total > 0 && segments.map((seg, i) => {
        const percent = seg.value / total;
        if (percent <= 0) return null;
        const dash = percent * circumference;
        const rotation = cumulativePercent * 360 - 90;
        cumulativePercent += percent;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
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
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.55" letterSpacing="0.5">
          {centerLabel.toUpperCase()}
        </text>
      )}
    </svg>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, hint, icon, iconBg }: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08rem', color: 'text.secondary' }}>
              {label}
            </Typography>
            <Typography sx={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>
              {value}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mt: 0.5 }}>
              • {hint}
            </Typography>
          </Box>
          <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.5 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Skeleton variant="text" width="60%" height={14} />
        <Skeleton variant="text" width="40%" height={36} sx={{ mt: 0.5 }} />
        <Skeleton variant="text" width="80%" height={12} sx={{ mt: 0.5 }} />
      </CardContent>
    </Card>
  );
}

// ─── Category breakdown ───────────────────────────────────────────────────────

function CategoryBreakdown({ items, total, t }: { items: CategoryStat[]; total: number; t: (k: string) => string }) {
  const segments = items.map(item => ({ value: item.count, color: CATEGORY_CONFIG[item.category]?.color ?? '#888' }));

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <BarChartIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08rem' }}>
            {t('analytics.categories.title')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <DonutChart segments={segments} total={total} centerLabel={t('analytics.categories.active')} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {items.map((item) => {
              const cfg = CATEGORY_CONFIG[item.category];
              const unit = t(`analytics.categories.unit.${item.category}`);
              return (
                <Box key={item.category} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cfg?.color ?? '#888', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.75rem', flex: 1, minWidth: 0 }} noWrap>
                    {t(`analytics.categories.${item.category}`)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', flexShrink: 0 }}>
                    {item.count} {unit}
                  </Typography>
                </Box>
              );
            })}
            {items.length === 0 && (
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {t('status.empty')}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Maturity planning ────────────────────────────────────────────────────────

function MaturityPlanning({ stats, t }: { stats: AnalyticsStats; t: (k: string, opts?: Record<string, unknown>) => string }) {
  const { maturityPlanning, cigarModulesCount } = stats;
  const currentYear = new Date().getFullYear();

  const rows = [
    { label: t('analytics.maturity.readyNow'), count: maturityPlanning.readyNow.count, percent: maturityPlanning.readyNow.percent, color: '#D97706' },
    { label: t('analytics.maturity.preserve'), count: maturityPlanning.preserve.count, percent: maturityPlanning.preserve.percent, color: 'rgba(128,128,128,0.35)' },
    { label: t('analytics.maturity.pastPeak'), count: maturityPlanning.pastPeak.count, percent: maturityPlanning.pastPeak.percent, color: 'rgba(128,128,128,0.2)' },
  ];

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08rem' }}>
              {t('analytics.maturity.title')}
            </Typography>
          </Box>
          <Chip
            label={t('analytics.maturity.season', { year: `${currentYear}/${currentYear + 4}` })}
            size="small"
            sx={{ fontSize: '0.6rem', fontWeight: 700, bgcolor: 'warning.main', color: 'warning.contrastText', height: 20 }}
          />
        </Box>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 2.5, lineHeight: 1.5 }}>
          {t('analytics.maturity.description')}
        </Typography>
        {rows.map((row) => (
          <Box key={row.label} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{row.label}</Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {t('analytics.maturity.countLabel', { count: row.count, percent: row.percent })}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={row.percent}
              sx={{
                height: 8, borderRadius: 4, bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': { bgcolor: row.color, borderRadius: 4 },
              }}
            />
          </Box>
        ))}
        {cigarModulesCount > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 2, bgcolor: 'action.hover', borderRadius: 2, p: 1.5 }}>
            <ShieldIcon sx={{ fontSize: 16, color: 'primary.main', mt: 0.1, flexShrink: 0 }} />
            <Box>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }}>{t('analytics.maturity.humidorTip')}</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.25 }}>
                {t('analytics.maturity.humidorTipText')}
              </Typography>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Region cards ─────────────────────────────────────────────────────────────

function RegionCards({ regions, t }: { regions: RegionStat[]; t: (k: string) => string }) {
  if (regions.length === 0) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
      {regions.map((r) => (
        <Card key={r.region} variant="outlined" sx={{ minWidth: 140, flex: '0 0 auto' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1rem', color: 'primary.main', mb: 0.5 }}>
              {r.region}
            </Typography>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1 }}>{r.count}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 1 }}>{t('analytics.regionMap.items')}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{t('analytics.regionMap.valuation')}</Typography>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }}>{r.valuation} €</Typography>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

// ─── Garde planning section ───────────────────────────────────────────────────

function GardePlanningSection({ data, t }: { data: GardePoint[]; t: (k: string, opts?: Record<string, unknown>) => string }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CalendarIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Box>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08rem' }}>
              {t('analytics.garde.title')}
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
              {t('analytics.garde.subtitle')}
            </Typography>
          </Box>
        </Box>
        <GardeHistogram data={data} t={t} />
      </CardContent>
    </Card>
  );
}

// ─── Cave distribution ────────────────────────────────────────────────────────

function CaveDistribution({ caves, t }: { caves: CavePoint[]; t: (k: string) => string }) {
  if (caves.length === 0) return null;
  const maxCount = Math.max(...caves.map(c => c.count), 1);

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CellarIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08rem' }}>
            {t('analytics.caves.title')}
          </Typography>
        </Box>
        {caves.map((cave) => (
          <Box key={cave.cellarId} sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }} noWrap>{cave.cellarName}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', flexShrink: 0, ml: 1 }}>
                {cave.count} — {cave.valuation} €
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={(cave.count / maxCount) * 100}
              sx={{
                height: 6, borderRadius: 3, bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': { borderRadius: 3 },
              }}
            />
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAnalytics();

  if (isError) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Alert severity="error">{t('status.error')}</Alert>
      </Container>
    );
  }

  const totalItems = data?.totalActiveItems ?? 0;
  const catItems = data?.categoryBreakdown ?? [];

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>

      {/* Header */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BarChartIcon color="primary" />
            <Box>
              <Typography variant="h6" fontWeight={700}>{t('analytics.pageTitle')}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{t('analytics.pageSubtitle')}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {isLoading ? (
          [0,1,2,3].map(i => <Grid item xs={6} md={3} key={i}><StatCardSkeleton /></Grid>)
        ) : (
          <>
            <Grid item xs={6} md={3}>
              <StatCard
                label={t('analytics.stats.totalValuation')}
                value={`${data?.totalValuation ?? 0} €`}
                hint={t('analytics.stats.totalValuationHint')}
                icon={<EuroIcon sx={{ fontSize: 20, color: '#2563EB' }} />}
                iconBg="rgba(37,99,235,0.1)"
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                label={t('analytics.stats.liquidStock')}
                value={`${data?.totalLiquidLiters ?? 0} L`}
                hint={t('analytics.stats.liquidStockHint')}
                icon={<WaterIcon sx={{ fontSize: 20, color: '#0891B2' }} />}
                iconBg="rgba(8,145,178,0.1)"
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                label={t('analytics.stats.cigarHumidor')}
                value={`${data?.cigarModulesCount ?? 0} modules`}
                hint={t('analytics.stats.cigarHumidorHint')}
                icon={<CigarIcon sx={{ fontSize: 20, color: '#7B1E30' }} />}
                iconBg="rgba(123,30,48,0.1)"
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                label={t('analytics.stats.urgentDegustation')}
                value={data?.urgentDegustationCount ?? 0}
                hint={t('analytics.stats.urgentDegustationHint')}
                icon={<WarningIcon sx={{ fontSize: 20, color: '#D97706' }} />}
                iconBg="rgba(217,119,6,0.1)"
              />
            </Grid>
          </>
        )}
      </Grid>

      {/* World heatmap */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <GlobeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
            <Box>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08rem' }}>
                {t('analytics.regionMap.mapTitle')}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                {t('analytics.regionMap.mapSubtitle')}
              </Typography>
            </Box>
          </Box>
          {isLoading ? (
            <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 2 }} />
          ) : (
            <WorldHeatmap regions={data?.regionBreakdown ?? []} t={t} />
          )}
        </CardContent>
      </Card>

      {/* Region cards + Garde histogram */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          {isLoading ? (
            <Card variant="outlined"><CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                {[0,1,2,3,4].map(i => <Skeleton key={i} variant="rectangular" width={140} height={110} sx={{ borderRadius: 2 }} />)}
              </Box>
            </CardContent></Card>
          ) : (data?.regionBreakdown?.length ?? 0) > 0 ? (
            <Card variant="outlined">
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <GlobeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08rem' }}>
                    {t('analytics.regionMap.title')}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 0.5 }}>
                    — {t('analytics.regionMap.subtitle')}
                  </Typography>
                </Box>
                <RegionCards regions={data?.regionBreakdown ?? []} t={t} />
              </CardContent>
            </Card>
          ) : null}
        </Grid>
      </Grid>

      {/* Garde planning histogram */}
      {(data?.gardeHistogram?.length ?? 0) > 0 && (
        <Box sx={{ mb: 3 }}>
          <GardePlanningSection
            data={data?.gardeHistogram ?? []}
            t={t as (k: string, opts?: Record<string, unknown>) => string}
          />
        </Box>
      )}

      {/* Category donut + Maturity planning + Cave distribution */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          {isLoading ? (
            <Card variant="outlined"><CardContent sx={{ p: 2.5, height: 280 }}><Skeleton height="100%" /></CardContent></Card>
          ) : (
            <CategoryBreakdown items={catItems} total={totalItems} t={t} />
          )}
        </Grid>
        <Grid item xs={12} md={(data?.caveDistribution?.length ?? 0) > 0 ? 5 : 8}>
          {isLoading ? (
            <Card variant="outlined"><CardContent sx={{ p: 2.5, height: 280 }}><Skeleton height="100%" /></CardContent></Card>
          ) : data ? (
            <MaturityPlanning stats={data} t={t as (k: string, opts?: Record<string, unknown>) => string} />
          ) : null}
        </Grid>
        {(data?.caveDistribution?.length ?? 0) > 0 && (
          <Grid item xs={12} md={3}>
            <CaveDistribution caves={data?.caveDistribution ?? []} t={t} />
          </Grid>
        )}
      </Grid>
    </Container>
  );
}
