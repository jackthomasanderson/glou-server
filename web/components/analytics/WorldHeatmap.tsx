'use client';

import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ButtonGroup, Button, Select, SelectItem } from '@heroui/react';
import { LayoutGrid, Flame } from 'lucide-react';
import { getRegionCoordinates } from '@/lib/analytics/regionCoordinates';
import { RegionCategoryStat } from '@/lib/analytics/types';
import { CATEGORY_HEX, CATEGORY_ORDER } from '@/lib/analytics/categoryColors';
import { InventoryCategory } from '@/lib/inventory/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function radiusFromCount(count: number): number {
  if (count >= 20) return 22;
  if (count >= 10) return 18;
  if (count >= 5) return 14;
  if (count >= 3) return 11;
  return 9;
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

// ─── Popup content ────────────────────────────────────────────────────────────

function RegionPopup({ marker, t }: { marker: MarkerData; t: (k: string) => string }) {
  return (
    <div className="min-w-[130px] font-[Inter,sans-serif]">
      <div className="font-extrabold text-[0.72rem] uppercase tracking-wider text-blue-600 mb-1">
        {marker.region}
      </div>
      <div className="text-[0.82rem] font-bold">
        {marker.count} {t('analytics.regionMap.items')}
      </div>
      <div className="text-[0.75rem] text-gray-500 mt-0.5">
        {t('analytics.regionMap.valuation')}{' '}
        <strong>{marker.valuation} €</strong>
      </div>
      {marker.categoryLabel && (
        <div className="text-[0.7rem] text-gray-400 mt-0.5">{marker.categoryLabel}</div>
      )}
    </div>
  );
}

// ─── Resize helper: invalidate map size when container is revealed ────────────

function MapResizer() {
  const map = useMap();
  React.useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(id);
  }, [map]);
  return null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

type MapDisplayMode = 'markers' | 'heatmap';
type HeatmapType = 'dominant' | InventoryCategory;

interface WorldHeatmapProps {
  /** Full region × category split (FEAT-40/41), already filtered by the FEAT-42 sidebar (type multi-select). */
  regionCategoryBreakdown: RegionCategoryStat[];
  onRegionClick?: (region: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorldHeatmap({ regionCategoryBreakdown, onRegionClick, t }: WorldHeatmapProps) {
  const [mode, setMode] = useState<MapDisplayMode>('markers');
  const [heatmapType, setHeatmapType] = useState<HeatmapType>('dominant');

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

  // `unmapped` counts, within the *current view's* candidate regions, how
  // many lack known coordinates — not regions hidden by the type filter
  // itself (that would misleadingly inflate the count).
  const { markers, unmappedCount } = useMemo(() => {
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
    let unmapped = 0;
    for (const c of candidates) {
      const coord = getRegionCoordinates(c.region);
      if (!coord) {
        unmapped += 1;
        continue;
      }
      resolved.push({ ...c, lat: coord.lat, lng: coord.lng });
    }
    return { markers: resolved, unmappedCount: unmapped };
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
          >
            {t('analytics.map.mode.markers')}
          </Button>
          <Button
            color={mode === 'heatmap' ? 'primary' : 'default'}
            variant={mode === 'heatmap' ? 'flat' : 'light'}
            startContent={<Flame size={14} />}
            onPress={() => setMode('heatmap')}
          >
            {t('analytics.map.mode.heatmap')}
          </Button>
        </ButtonGroup>

        {mode === 'heatmap' && (
          <Select
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
          </Select>
        )}
      </div>

      {/* Map container */}
      <div
        className="rounded-2xl overflow-hidden border border-default-200 relative h-[380px] isolate"
        style={
          {
            // Override leaflet popup styles
            '--leaflet-popup-border-radius': '10px',
          } as React.CSSProperties
        }
      >
        <style>{`
          .leaflet-tooltip {
            border-radius: 10px !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
            padding: 10px 14px !important;
            border: 1px solid rgba(0,0,0,0.08) !important;
            background: #fff !important;
            color: inherit !important;
          }
          .leaflet-tooltip::before {
            display: none !important;
          }
          .leaflet-control-attribution {
            font-size: 0.6rem;
            background: transparent !important;
          }
          .leaflet-interactive {
            cursor: pointer;
          }
        `}</style>
        <MapContainer
          center={[25, 10]}
          zoom={2}
          minZoom={1}
          maxZoom={10}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
          worldCopyJump
        >
          <MapResizer />
          {/* CARTO's free raster basemaps (basemaps.cartocdn.com) started requiring
              an API key in August 2026 and now watermark unauthenticated requests
              ("API KEY REQUIRED") — a self-hosted app can't assume every instance
              owner has (or wants) a CARTO key, so this uses the standard anonymous
              OpenStreetMap tile server instead. No dark-mode variant is available
              without a keyed provider; the map falls back to the light style in
              both themes. */}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {markers.map((marker) => (
            <CircleMarker
              key={marker.region}
              center={[marker.lat, marker.lng]}
              radius={radiusFromCount(marker.count)}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: marker.color,
                fillOpacity: marker.fillOpacity,
              }}
              eventHandlers={
                onRegionClick ? { click: () => onRegionClick(marker.region) } : undefined
              }
            >
              <Tooltip sticky>
                <RegionPopup marker={marker} t={t} />
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
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
              <span className="text-[0.68rem] text-default-500">{t(`categories.${cat}`)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer: unmapped notice */}
      {unmappedCount > 0 && (
        <p className="text-[0.65rem] text-default-400 mt-1.5">
          {t('analytics.regionMap.unmapped', { count: unmappedCount })}
        </p>
      )}
    </div>
  );
}
