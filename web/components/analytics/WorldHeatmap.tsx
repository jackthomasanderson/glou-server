'use client';

import React, { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import type { GeoJsonObject } from 'geojson';
import geoUrl from 'world-atlas/countries-110m.json';
import { ButtonGroup, Button, SelectItem } from '@heroui/react';
import { LayoutGrid, Flame } from 'lucide-react';
import Link from 'next/link';
import { findKnownRegion } from '@shared/map-location';
import type { NoLocationStat, RegionCategoryStat } from '@/lib/analytics/types';
import { CATEGORY_HEX, CATEGORY_ORDER } from '@/lib/analytics/categoryColors';
import { InventoryCategory } from '@/lib/inventory/types';
import { useThemeMode } from '@/hooks/useThemeMode';
import i18n from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { segmentClass } from '@/components/ui/segmentClass';
import { SingleSelect } from '@/components/ui/SingleSelect';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function radiusFromCount(count: number): number {
  if (count >= 20) return 11;
  if (count >= 10) return 9;
  if (count >= 5) return 7;
  if (count >= 3) return 5.5;
  return 4.5;
}

interface RegionAgg {
  count: number;
  valuation: number;
}

function aggregateByRegion(stats: RegionCategoryStat[]): Record<string, RegionAgg> {
  const map: Record<string, RegionAgg> = {};
  for (const s of stats) {
    if (!map[s.region]) map[s.region] = { count: 0, valuation: 0 };
    map[s.region].count += s.count;
    map[s.region].valuation += s.valuation;
  }
  return map;
}

function dominantCategoryByRegion(stats: RegionCategoryStat[]): Record<string, InventoryCategory> {
  const best: Record<string, { category: InventoryCategory; count: number }> = {};
  for (const s of stats) {
    const cat = s.category as InventoryCategory;
    if (!best[s.region] || s.count > best[s.region].count) {
      best[s.region] = { category: cat, count: s.count };
    }
  }
  const out: Record<string, InventoryCategory> = {};
  for (const [region, v] of Object.entries(best)) out[region] = v.category;
  return out;
}

/** How many unknown regions the "not on the map" line names before "and N more". */
const NAMED_UNKNOWN_REGIONS = 5;

interface NotOnMap {
  bottles: number;
  cigars: number;
  /** Units with neither a region nor a placeable appellation. */
  noRegion: number;
  /** Regions the map cannot place, most stocked first. */
  unknownRegions: string[];
}

/**
 * #961: the units in stock the map cannot show — in a region it does not
 * know, or with nothing to place them by — counted in bottles (cigars apart),
 * like every figure of the map.
 */
function notOnMap(stats: RegionCategoryStat[], noLocation: NoLocationStat[]): NotOnMap {
  const result: NotOnMap = { bottles: 0, cigars: 0, noRegion: 0, unknownRegions: [] };
  const add = (category: string, count: number) => {
    if (category === 'cigar') result.cigars += count;
    else result.bottles += count;
  };
  const unknown = new Map<string, number>();
  for (const s of stats) {
    if (findKnownRegion(s.region)) continue;
    add(s.category, s.count);
    unknown.set(s.region, (unknown.get(s.region) ?? 0) + s.count);
  }
  for (const s of noLocation) {
    add(s.category, s.count);
    result.noRegion += s.count;
  }
  result.unknownRegions = Array.from(unknown.entries())
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([region]) => region);
  return result;
}

interface MarkerData {
  region: string;
  count: number;
  valuation: number;
  lat: number;
  lng: number;
  color: string;
  fillOpacity: number;
  categoryLabel?: string;
}

// ─── Tooltip content (ISSUE_225: react-simple-maps has no built-in tooltip
// like react-leaflet's <Tooltip>, so hover state is tracked manually below
// and this renders into a fixed-position div that follows the pointer) ────────

function RegionTooltip({ marker, t, lang }: { marker: MarkerData; t: (k: string, o?: Record<string, unknown>) => string; lang: string }) {
  return (
    <div className="min-w-[130px]">
      <div className="font-extrabold text-xs uppercase tracking-wider text-primary mb-1">
        {marker.region}
      </div>
      <div className="text-sm font-bold">
        {marker.count} {t('analytics.regionMap.items', { count: marker.count })}
      </div>
      <div className="text-xs text-foreground-500 mt-0.5">
        {t('analytics.regionMap.valuation')}{' '}
        <strong>{formatCurrency(marker.valuation, lang)}</strong>
      </div>
      {marker.categoryLabel && (
        <div className="text-xs text-foreground-400 mt-0.5">{marker.categoryLabel}</div>
      )}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

type MapDisplayMode = 'markers' | 'heatmap';
type HeatmapType = 'dominant' | InventoryCategory;

interface WorldHeatmapProps {
  /** Full region × category split (FEAT-40/41), already filtered by the FEAT-42 sidebar (type multi-select). */
  regionCategoryBreakdown: RegionCategoryStat[];
  /** #961: units in stock with nothing to place them by, filtered like the breakdown. */
  noLocationBreakdown: NoLocationStat[];
  /** The one category the map is narrowed to, if any: the bottles list opens on it too. */
  onlyCategory?: string | null;
  onRegionClick?: (region: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorldHeatmap({ regionCategoryBreakdown, noLocationBreakdown, onlyCategory, onRegionClick, t }: WorldHeatmapProps) {
  const [mode, setMode] = useState<MapDisplayMode>('markers');
  const [heatmapType, setHeatmapType] = useState<HeatmapType>('dominant');
  const [hovered, setHovered] = useState<{ marker: MarkerData; x: number; y: number } | null>(null);
  const { isDark } = useThemeMode();

  // Single homogeneous options array: HeroUI's `Select` cannot type-check
  // children that mix a static `<SelectItem>` with a `.map()`-generated
  // array (`Element[]` isn't assignable to `CollectionElement<object>`) —
  // this broke the production build (see CI runs #144/#145). Building one
  // list up front and mapping over it once avoids the mixed-children shape.
  const heatmapTypeOptions = useMemo(
    () => [
      { key: 'dominant' as HeatmapType, label: t('analytics.map.heatmapType.dominant') },
      ...CATEGORY_ORDER.map((cat) => ({ key: cat as HeatmapType, label: t(`categories.${cat}`) })),
    ],
    [t],
  );

  const missing = useMemo(
    () => notOnMap(regionCategoryBreakdown, noLocationBreakdown),
    [regionCategoryBreakdown, noLocationBreakdown],
  );

  const markers = useMemo(() => {
    let candidates: { region: string; count: number; valuation: number; color: string; fillOpacity: number; categoryLabel?: string }[];

    if (mode === 'markers') {
      const byRegion = aggregateByRegion(regionCategoryBreakdown);
      candidates = Object.entries(byRegion).map(([region, agg]) => ({
        region,
        count: agg.count,
        valuation: Math.round(agg.valuation),
        color: '#2563EB',
        fillOpacity: 0.85,
      }));
    } else if (heatmapType === 'dominant') {
      const byRegion = aggregateByRegion(regionCategoryBreakdown);
      const dominant = dominantCategoryByRegion(regionCategoryBreakdown);
      candidates = Object.entries(byRegion).map(([region, agg]) => {
        const cat = dominant[region];
        return {
          region,
          count: agg.count,
          valuation: Math.round(agg.valuation),
          color: cat ? CATEGORY_HEX[cat] : '#888888',
          fillOpacity: 0.85,
          categoryLabel: cat ? t(`categories.${cat}`) : undefined,
        };
      });
    } else {
      // Specific category selected: intensity-graded by count within that type.
      const entries = regionCategoryBreakdown.filter((s) => s.category === heatmapType);
      const maxCount = entries.reduce((max, e) => Math.max(max, e.count), 0);
      candidates = entries.map((e) => {
        const intensity = maxCount > 0 ? e.count / maxCount : 0;
        return {
          region: e.region,
          count: e.count,
          valuation: e.valuation,
          color: CATEGORY_HEX[heatmapType],
          fillOpacity: Math.min(0.95, Math.max(0.15, 0.15 + intensity * 0.8)),
          categoryLabel: t(`categories.${heatmapType}`),
        };
      });
    }

    const resolved: MarkerData[] = [];
    for (const c of candidates) {
      const place = findKnownRegion(c.region);
      if (place) resolved.push({ ...c, lat: place.lat, lng: place.lng });
    }
    return resolved;
  }, [mode, heatmapType, regionCategoryBreakdown, t]);

  return (
    <div>
      {/* Toolbar: display mode + heatmap type selector */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ButtonGroup size="sm" variant="flat">
          <Button
            color={mode === 'markers' ? 'primary' : 'default'}
            variant={mode === 'markers' ? 'flat' : 'light'}
            startContent={<LayoutGrid size={14} />}
            onPress={() => setMode('markers')}
            aria-pressed={mode === 'markers'}
            className={segmentClass(mode === 'markers')}
          >
            {t('analytics.map.mode.markers')}
          </Button>
          <Button
            color={mode === 'heatmap' ? 'primary' : 'default'}
            variant={mode === 'heatmap' ? 'flat' : 'light'}
            startContent={<Flame size={14} />}
            onPress={() => setMode('heatmap')}
            aria-pressed={mode === 'heatmap'}
            className={segmentClass(mode === 'heatmap')}
          >
            {t('analytics.map.mode.heatmap')}
          </Button>
        </ButtonGroup>

        {mode === 'heatmap' && (
          <SingleSelect
            size="sm"
            radius="md"
            variant="flat"
            selectedKeys={[heatmapType]}
            onSelectionChange={(keys) => setHeatmapType(Array.from(keys)[0] as HeatmapType)}
            className="w-48"
            aria-label={t('analytics.map.heatmapType.label')}
          >
            {heatmapTypeOptions.map((opt) => (
              <SelectItem key={opt.key}>{opt.label}</SelectItem>
            ))}
          </SingleSelect>
        )}
      </div>

      {/* Map container */}
      <div className="rounded-2xl overflow-hidden border border-default-200 relative h-[380px] bg-default-50">
        <ComposableMap
          projectionConfig={{ scale: 140, center: [10, 15] }}
          style={{ width: '100%', height: '100%' }}
        >
          {/* world-atlas ships raw TopoJSON (a `Topology`), which Geographies
              converts at runtime via topojson-client — its own type only
              declares the already-fetched-and-parsed GeoJSON shape, hence
              the cast. */}
          <Geographies geography={geoUrl as unknown as GeoJsonObject}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isDark ? '#3f3f46' : '#e4e4e7'}
                  stroke={isDark ? '#52525b' : '#d4d4d8'}
                  strokeWidth={0.5}
                  style={{ outline: 'none' }}
                />
              ))
            }
          </Geographies>
          {markers.map((marker) => (
            <Marker
              key={marker.region}
              coordinates={[marker.lng, marker.lat]}
              onMouseEnter={(e) => setHovered({ marker, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHovered({ marker, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onRegionClick?.(marker.region)}
              style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
            >
              <circle
                r={radiusFromCount(marker.count)}
                fill={marker.color}
                fillOpacity={marker.fillOpacity}
                stroke="#ffffff"
                strokeWidth={1.2}
              />
            </Marker>
          ))}
        </ComposableMap>

        {/* #961: nothing placed — say what places a bottle. */}
        {markers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            <p className="max-w-sm text-center text-sm text-foreground-500 bg-content1 border border-divider rounded-xl px-4 py-3">
              {t('analytics.regionMap.empty')}
            </p>
          </div>
        )}

        {hovered && (
          <div
            className="fixed z-40 pointer-events-none bg-content1 border border-divider rounded-xl shadow-lg px-3 py-2"
            style={{ left: hovered.x + 12, top: hovered.y + 12 }}
          >
            <RegionTooltip marker={hovered.marker} t={t} lang={i18n.language} />
          </div>
        )}
      </div>

      {/* Legend (heatmap mode only) */}
      {mode === 'heatmap' && (
        <div className="flex flex-wrap gap-3 mt-2.5">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: CATEGORY_HEX[cat] }}
              />
              <span className="text-xs text-foreground-500">{t(`categories.${cat}`)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer (#961): the bottles in stock the map cannot show, never silently dropped. */}
      {missing.bottles + missing.cigars > 0 && (
        <p className="text-xs text-foreground-500 mt-1.5" data-testid="map-not-located">
          {t('analytics.regionMap.notOnMap', {
            count: missing.bottles + missing.cigars,
            what: missing.bottles > 0 && missing.cigars > 0
              ? t('analytics.regionMap.bottlesAndCigars', {
                bottles: t('analytics.regionMap.bottles', { count: missing.bottles }),
                cigars: t('analytics.regionMap.cigars', { count: missing.cigars }),
              })
              : missing.bottles > 0
                ? t('analytics.regionMap.bottles', { count: missing.bottles })
                : t('analytics.regionMap.cigars', { count: missing.cigars }),
          })}
          {missing.unknownRegions.length > 0 && (
            <>
              {' '}
              {t('analytics.regionMap.unknownRegions', {
                count: missing.unknownRegions.length,
                regions: missing.unknownRegions.slice(0, NAMED_UNKNOWN_REGIONS).join(', ')
                  + (missing.unknownRegions.length > NAMED_UNKNOWN_REGIONS
                    ? ` ${t('analytics.regionMap.moreRegions', { count: missing.unknownRegions.length - NAMED_UNKNOWN_REGIONS })}`
                    : ''),
              })}
            </>
          )}
          {missing.noRegion > 0 && <>{' '}{t('analytics.regionMap.noRegion', { count: missing.noRegion })}</>}
          {missing.bottles > 0 && (
            <>
              {' '}
              <Link
                href={`/bottles?filter=notLocated${onlyCategory && onlyCategory !== 'cigar' ? `&category=${encodeURIComponent(onlyCategory)}` : ''}`}
                className="text-primary font-semibold hover:underline"
              >
                {t('analytics.regionMap.seeBottles')}
              </Link>
            </>
          )}
          {missing.cigars > 0 && (
            <>
              {missing.bottles > 0 ? (
                <span data-testid="not-on-map-separator" aria-hidden="true">{' · '}</span>
              ) : ' '}
              <Link href="/cigars?filter=notLocated" className="text-primary font-semibold hover:underline">
                {t('analytics.regionMap.seeCigars')}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
