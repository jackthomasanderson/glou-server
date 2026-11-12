'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup, useMapContext, useZoomPanContext,
} from 'react-simple-maps';
import type { GeoJsonObject } from 'geojson';
import geoUrl from 'world-atlas/countries-110m.json';
import { ButtonGroup, Button, SelectItem } from '@heroui/react';
import { LayoutGrid, Flame, Plus, Minus, LocateFixed, Maximize2, Minimize2 } from 'lucide-react';
import Link from 'next/link';
import { findKnownRegion } from '@shared/map-location';
import type { NoLocationStat, RegionCategoryStat } from '@/lib/analytics/types';
import { CATEGORY_HEX, CATEGORY_ORDER } from '@/lib/analytics/categoryColors';
import {
  MAP_MAX_ZOOM, MAP_MIN_ZOOM, WORLD_VIEW,
  acceptsMapGesture, clusterMarkers, fitView, focusView, majorityColor, markerRadius, stepZoom, worldScale,
  type GestureEvent, type LngLat, type MapProjector, type MapView, type MarkerCluster,
} from '@/lib/analytics/mapView';
import { InventoryCategory } from '@/lib/inventory/types';
import { useThemeMode } from '@/hooks/useThemeMode';
import i18n from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { segmentClass } from '@/components/ui/segmentClass';
import { SingleSelect } from '@/components/ui/SingleSelect';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  /** ISO code of the region's country (FEAT-114: named in a group's tooltip). */
  country: string;
  color: string;
  fillOpacity: number;
  categoryLabel?: string;
  /** Bottles per colour in the current view: a group takes the colour with the most. */
  split: { color: string; count: number }[];
}

/** A marker placed on the map's projection (zoom 1), ready to be grouped. */
interface PlacedMarker extends MarkerData {
  x: number;
  y: number;
}

type Cluster = MarkerCluster<PlacedMarker>;

const MARKER_BLUE = '#2563EB';
const UNKNOWN_GREY = '#888888';
/** The map's size until it is measured (and in tests, where nothing has a size). */
const FALLBACK_SIZE = { width: 800, height: 380 };
/** The map's ring marking a group of regions, and the gap to its disc, in pixels. */
const GROUP_RING_GAP = 2.5;

function countryName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

// ─── Tooltip content (ISSUE_225: react-simple-maps has no built-in tooltip
// like react-leaflet's <Tooltip>, so hover state is tracked manually below
// and this renders into a fixed-position div that follows the pointer) ────────

type T = (k: string, o?: Record<string, unknown>) => string;

function RegionTooltip({ marker, t, lang }: { marker: MarkerData; t: T; lang: string }) {
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

/** FEAT-114: a group lists its regions, with their country when they are not all from one. */
function ClusterTooltip({ cluster, t, lang }: { cluster: Cluster; t: T; lang: string }) {
  const members = [...cluster.members].sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));
  const severalCountries = new Set(members.map((m) => m.country)).size > 1;
  return (
    <div className="min-w-[160px]" data-testid="map-cluster-tooltip">
      <div className="font-extrabold text-xs uppercase tracking-wider text-primary mb-1">
        {t('analytics.map.cluster.regions', { count: members.length })}
      </div>
      <div className="text-sm font-bold mb-1">
        {cluster.count} {t('analytics.regionMap.items', { count: cluster.count })}
      </div>
      <ul className="text-xs text-foreground-500 space-y-0.5">
        {members.map((m) => (
          <li key={m.region}>
            {m.region}
            {severalCountries && <> ({countryName(m.country, lang)})</>}
            {' · '}
            <strong>{m.count}</strong>
          </li>
        ))}
      </ul>
      <div className="text-xs text-foreground-400 mt-1">{t('analytics.map.cluster.hint')}</div>
    </div>
  );
}

type Hovered = { x: number; y: number } & ({ marker: MarkerData } | { cluster: Cluster });

// ─── Map layers (inside ComposableMap, where the projection is known) ────────

/** Hands the map's projection to the component holding the view (framing needs it). */
function ProjectionBridge({ onChange }: { onChange: (projector: MapProjector) => void }) {
  const { projection, width, height } = useMapContext();
  useEffect(() => {
    onChange({
      width,
      height,
      project: (point) => projection(point) ?? null,
      invert: (point) => projection.invert?.(point) ?? null,
    });
  }, [projection, width, height, onChange]);
  return null;
}

/**
 * The markers, grouped by what overlaps at the current zoom and drawn at a
 * constant size on screen: the zoomable group scales its content by k, so
 * every radius, stroke and font size is divided by k.
 */
function MarkerLayer({ markers, onHover, onRegionClick, onClusterClick }: {
  markers: MarkerData[];
  onHover: (hovered: Hovered | null) => void;
  onRegionClick?: (region: string) => void;
  onClusterClick: (cluster: Cluster) => void;
}) {
  const { projection } = useMapContext();
  const { k } = useZoomPanContext();
  const placed = useMemo(() => markers.flatMap((m): PlacedMarker[] => {
    const xy = projection([m.lng, m.lat]);
    return xy ? [{ ...m, x: xy[0], y: xy[1] }] : [];
  }), [markers, projection]);
  const clusters = clusterMarkers(placed, k);

  return (
    <>
      {clusters.map((cluster) => {
        const lead = cluster.members[0];
        if (cluster.members.length === 1) {
          return (
            <Marker
              key={lead.region}
              coordinates={[lead.lng, lead.lat]}
              data-testid="map-marker"
              data-region={lead.region}
              onMouseEnter={(e) => onHover({ marker: lead, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => onHover({ marker: lead, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => onHover(null)}
              onClick={() => onRegionClick?.(lead.region)}
              style={{ cursor: onRegionClick ? 'pointer' : 'default' }}
            >
              <circle
                r={markerRadius(lead.count) / k}
                fill={lead.color}
                fillOpacity={lead.fillOpacity}
                stroke="#ffffff"
                strokeWidth={1.2 / k}
              />
            </Marker>
          );
        }
        const color = majorityColor(cluster.members.flatMap((m) => m.split)) ?? lead.color;
        const r = markerRadius(cluster.count);
        return (
          <Marker
            key={cluster.members.map((m) => m.region).join('|')}
            coordinates={[lead.lng, lead.lat]}
            data-testid="map-cluster"
            data-regions={cluster.members.map((m) => m.region).sort().join('|')}
            onMouseEnter={(e) => onHover({ cluster, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => onHover({ cluster, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onHover(null)}
            onClick={() => {
              onHover(null);
              onClusterClick(cluster);
            }}
            style={{ cursor: 'zoom-in' }}
          >
            {/* The ring sets a group apart from a single region. */}
            <circle r={(r + GROUP_RING_GAP) / k} fill="none" stroke={color} strokeWidth={1.5 / k} />
            <circle
              r={r / k}
              fill={color}
              fillOpacity={Math.max(...cluster.members.map((m) => m.fillOpacity))}
              stroke="#ffffff"
              strokeWidth={1.2 / k}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={8 / k}
              fontWeight={700}
              fill="#ffffff"
              pointerEvents="none"
            >
              {cluster.count}
            </text>
          </Marker>
        );
      })}
    </>
  );
}

/** The map's size on screen, so the map fills its frame (inline or full screen). */
function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize(width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : FALLBACK_SIZE);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
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
  /** FEAT-114: a region chosen in the region list; the map centres on it (each new nonce). */
  focusRequest?: { region: string; nonce: number } | null;
  /** FEAT-114: whether the map fills the window, and the control that switches it. */
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorldHeatmap({
  regionCategoryBreakdown, noLocationBreakdown, onlyCategory, onRegionClick, focusRequest, isFullscreen = false, onToggleFullscreen, t,
}: WorldHeatmapProps) {
  const [mode, setMode] = useState<MapDisplayMode>('markers');
  const [heatmapType, setHeatmapType] = useState<HeatmapType>('dominant');
  const [hovered, setHovered] = useState<Hovered | null>(null);
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
    let candidates: Omit<MarkerData, 'lat' | 'lng' | 'country'>[];

    if (mode === 'markers') {
      const byRegion = aggregateByRegion(regionCategoryBreakdown);
      candidates = Object.entries(byRegion).map(([region, agg]) => ({
        region,
        count: agg.count,
        valuation: Math.round(agg.valuation),
        color: MARKER_BLUE,
        fillOpacity: 0.85,
        split: [{ color: MARKER_BLUE, count: agg.count }],
      }));
    } else if (heatmapType === 'dominant') {
      const byRegion = aggregateByRegion(regionCategoryBreakdown);
      const dominant = dominantCategoryByRegion(regionCategoryBreakdown);
      // FEAT-114: a group takes the category with the most bottles across its regions.
      const splits = new Map<string, MarkerData['split']>();
      for (const s of regionCategoryBreakdown) {
        const split = splits.get(s.region) ?? [];
        split.push({ color: CATEGORY_HEX[s.category as InventoryCategory] ?? UNKNOWN_GREY, count: s.count });
        splits.set(s.region, split);
      }
      candidates = Object.entries(byRegion).map(([region, agg]) => {
        const cat = dominant[region];
        return {
          region,
          count: agg.count,
          valuation: Math.round(agg.valuation),
          color: cat ? CATEGORY_HEX[cat] : UNKNOWN_GREY,
          fillOpacity: 0.85,
          categoryLabel: cat ? t(`categories.${cat}`) : undefined,
          split: splits.get(region) ?? [],
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
          split: [{ color: CATEGORY_HEX[heatmapType], count: e.count }],
        };
      });
    }

    const resolved: MarkerData[] = [];
    for (const c of candidates) {
      const place = findKnownRegion(c.region);
      if (place) resolved.push({ ...c, lat: place.lat, lng: place.lng, country: place.country });
    }
    return resolved;
  }, [mode, heatmapType, regionCategoryBreakdown, t]);

  // ─── FEAT-114: what part of the map is shown ───────────────────────────────
  const mapRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(mapRef);
  const [projector, setProjector] = useState<MapProjector | null>(null);
  // Kept across a change of view type, of filter or of full screen: only the markers change.
  const [view, setView] = useState<MapView>(WORLD_VIEW);
  const markerPoints = useMemo(() => markers.map((m): LngLat => [m.lng, m.lat]), [markers]);

  // The page opens framed on the cellar's regions (the whole world when none
  // is placed), once the projection is known; a region chosen in the region
  // list then centres the map on it. Both adjust the view while rendering
  // (React's pattern for state that follows a prop), not in an effect.
  const [isFramed, setIsFramed] = useState(false);
  if (!isFramed && projector) {
    setIsFramed(true);
    setView(fitView(markerPoints, projector));
  }
  const [handledFocus, setHandledFocus] = useState<number | null>(null);
  if (focusRequest && projector && isFramed && handledFocus !== focusRequest.nonce) {
    setHandledFocus(focusRequest.nonce);
    const place = findKnownRegion(focusRequest.region);
    if (place) setView(focusView([place.lng, place.lat], view, projector));
  }

  const zoomBy = (direction: 1 | -1) => {
    if (projector) setView((current) => stepZoom(current, direction, projector));
  };
  // Recenter frames the markers shown right now.
  const recenter = () => {
    if (projector) setView(fitView(markerPoints, projector));
  };
  const zoomToCluster = useCallback((cluster: Cluster) => {
    if (projector) setView(fitView(cluster.members.map((m): LngLat => [m.lng, m.lat]), projector));
  }, [projector]);
  const handleMoveEnd = useCallback(({ coordinates, zoom }: { coordinates?: [number, number]; zoom?: number }) => {
    if (coordinates && zoom) setView({ center: coordinates, zoom });
  }, []);
  const filterGesture = useCallback(
    (event: Event) => acceptsMapGesture(event as unknown as GestureEvent, isFullscreen),
    [isFullscreen],
  );

  // The wheel zooms the map, never the page, while the pointer is on it —
  // even at the zoom limits, where the map itself lets the event through.
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const keepOnMap = (event: WheelEvent) => event.preventDefault();
    el.addEventListener('wheel', keepOnMap, { passive: false });
    return () => el.removeEventListener('wheel', keepOnMap);
  }, []);

  const controlClass = 'bg-content1 shadow-sm border border-divider';
  const fullscreenLabel = isFullscreen ? t('analytics.map.controls.exitFullscreen') : t('analytics.map.controls.fullscreen');

  return (
    <div className={isFullscreen ? 'flex flex-col flex-1 min-h-0' : undefined}>
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
      <div
        ref={mapRef}
        data-testid="world-map"
        data-zoom={view.zoom}
        data-center={view.center.map((v) => v.toFixed(4)).join(',')}
        className={`rounded-2xl overflow-hidden border border-default-200 relative bg-default-50 ${isFullscreen ? 'flex-1 min-h-0' : 'h-[380px]'}`}
      >
        {size && (
          <ComposableMap
            width={size.width}
            height={size.height}
            projectionConfig={{ scale: worldScale(size.width, size.height), center: WORLD_VIEW.center }}
            // One finger scrolls the page and the browser never zooms the
            // page from the map; in full screen the map takes every touch.
            style={{ width: '100%', height: '100%', touchAction: isFullscreen ? 'none' : 'pan-x pan-y' }}
          >
            <ProjectionBridge onChange={setProjector} />
            {/* Remounted when the map is resized: react-simple-maps resets its
                gesture state on a new size without re-applying the view. */}
            <ZoomableGroup
              key={`${size.width}x${size.height}`}
              center={view.center}
              zoom={view.zoom}
              minZoom={MAP_MIN_ZOOM}
              maxZoom={MAP_MAX_ZOOM}
              translateExtent={[[0, 0], [size.width, size.height]]}
              filterZoomEvent={filterGesture}
              onMoveEnd={handleMoveEnd}
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
                      vectorEffect="non-scaling-stroke"
                      style={{ outline: 'none' }}
                    />
                  ))
                }
              </Geographies>
              <MarkerLayer
                markers={markers}
                onHover={setHovered}
                onRegionClick={onRegionClick}
                onClusterClick={zoomToCluster}
              />
            </ZoomableGroup>
          </ComposableMap>
        )}

        {/* FEAT-114: full screen, then zoom in, zoom out and recenter, top right. */}
        <div role="group" aria-label={t('analytics.map.controls.label')} className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
          {onToggleFullscreen && (
            <Button isIconOnly size="sm" variant="flat" className={controlClass} aria-label={fullscreenLabel} title={fullscreenLabel} onPress={onToggleFullscreen}>
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </Button>
          )}
          <Button
            isIconOnly size="sm" variant="flat" className={controlClass}
            aria-label={t('analytics.map.controls.zoomIn')} title={t('analytics.map.controls.zoomIn')}
            isDisabled={view.zoom >= MAP_MAX_ZOOM}
            onPress={() => zoomBy(1)}
          >
            <Plus size={16} />
          </Button>
          <Button
            isIconOnly size="sm" variant="flat" className={controlClass}
            aria-label={t('analytics.map.controls.zoomOut')} title={t('analytics.map.controls.zoomOut')}
            isDisabled={view.zoom <= MAP_MIN_ZOOM}
            onPress={() => zoomBy(-1)}
          >
            <Minus size={16} />
          </Button>
          <Button
            isIconOnly size="sm" variant="flat" className={controlClass}
            aria-label={t('analytics.map.controls.recenter')} title={t('analytics.map.controls.recenter')}
            onPress={recenter}
          >
            <LocateFixed size={16} />
          </Button>
        </div>

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
            className="fixed z-50 pointer-events-none bg-content1 border border-divider rounded-xl shadow-lg px-3 py-2"
            style={{ left: hovered.x + 12, top: hovered.y + 12 }}
          >
            {'cluster' in hovered
              ? <ClusterTooltip cluster={hovered.cluster} t={t} lang={i18n.language} />
              : <RegionTooltip marker={hovered.marker} t={t} lang={i18n.language} />}
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
