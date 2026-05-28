'use client';

import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getRegionCoordinates } from '@/lib/analytics/regionCoordinates';
import { RegionStat } from '@/lib/analytics/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function radiusFromCount(count: number): number {
  if (count >= 20) return 22;
  if (count >= 10) return 18;
  if (count >= 5) return 14;
  if (count >= 3) return 11;
  return 9;
}

interface MarkerData {
  region: string;
  count: number;
  valuation: number;
  lat: number;
  lng: number;
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

interface WorldHeatmapProps {
  regions: RegionStat[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorldHeatmap({ regions, t }: WorldHeatmapProps) {
  // Detect dark mode via CSS media query
  const isDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const markerColor = '#2563EB';

  const markers: MarkerData[] = regions
    .map((r) => {
      const coord = getRegionCoordinates(r.region);
      if (!coord) return null;
      return { region: r.region, count: r.count, valuation: r.valuation, lat: coord.lat, lng: coord.lng };
    })
    .filter((m): m is MarkerData => m !== null);

  const unmappedCount = regions.length - markers.length;

  return (
    <div>
      {/* Map container */}
      <div
        className="rounded-2xl overflow-hidden border border-default-200 relative h-[380px]"
        style={
          {
            // Override leaflet popup styles
            '--leaflet-popup-border-radius': '10px',
          } as React.CSSProperties
        }
      >
        <style>{`
          .leaflet-popup-content-wrapper {
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 0;
          }
          .leaflet-popup-content {
            margin: 12px 16px;
          }
          .leaflet-popup-tip-container {
            display: none;
          }
          .leaflet-control-attribution {
            font-size: 0.6rem;
            background: transparent !important;
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
          <TileLayer
            url={tileUrl}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {markers.map((marker) => (
            <CircleMarker
              key={marker.region}
              center={[marker.lat, marker.lng]}
              radius={radiusFromCount(marker.count)}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: markerColor,
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <RegionPopup marker={marker} t={t} />
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Footer: unmapped notice */}
      {unmappedCount > 0 && (
        <p className="text-[0.65rem] text-default-400 mt-1.5">
          {t('analytics.regionMap.unmapped', { count: unmappedCount })}
        </p>
      )}
    </div>
  );
}
