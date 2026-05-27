'use client';
import React, { useState, memo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';
import { Box, Typography, Tooltip, useTheme, Chip } from '@mui/material';
import { getRegionCoordinates } from '@/lib/analytics/regionCoordinates';
import { RegionStat } from '@/lib/analytics/types';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface MarkerData {
  region: string;
  count: number;
  valuation: number;
  lat: number;
  lng: number;
  category?: string;
}

interface WorldHeatmapProps {
  regions: RegionStat[];
  t: (key: string) => string;
}

const MARKER_COLOR_DEFAULT = '#2563EB';

function sizeFromCount(count: number): number {
  if (count >= 10) return 16;
  if (count >= 5) return 13;
  if (count >= 3) return 11;
  return 9;
}

const HeatmapMarker = memo(function HeatmapMarker({
  marker,
  active,
  onEnter,
  onLeave,
}: {
  marker: MarkerData;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const r = sizeFromCount(marker.count);
  const color = MARKER_COLOR_DEFAULT;

  return (
    <Marker coordinates={[marker.lng, marker.lat]}>
      <circle
        r={r}
        fill={active ? color : `${color}CC`}
        stroke="#fff"
        strokeWidth={1.5}
        style={{ cursor: 'pointer', transition: 'r 0.15s ease, fill 0.15s ease' }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
      {marker.count > 1 && (
        <text
          textAnchor="middle"
          y={r * 0.38}
          style={{
            fontSize: r * 0.9,
            fontWeight: 700,
            fill: '#fff',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {marker.count}
        </text>
      )}
    </Marker>
  );
});

export function WorldHeatmap({ regions, t }: WorldHeatmapProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [activeRegion, setActiveRegion] = useState<string | null>(null);

  const markers: MarkerData[] = regions
    .map((r) => {
      const coord = getRegionCoordinates(r.region);
      if (!coord) return null;
      return { region: r.region, count: r.count, valuation: r.valuation, lat: coord.lat, lng: coord.lng };
    })
    .filter((m): m is MarkerData => m !== null);

  const unmapped = regions.filter((r) => !getRegionCoordinates(r.region));
  const activeData = markers.find((m) => m.region === activeRegion);

  const geoFill = isDark ? '#1e2a3a' : '#e8edf3';
  const geoBorder = isDark ? '#2d3f55' : '#c8d4e0';
  const mapBg = isDark ? '#0f1a2e' : '#dce6f0';

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          label={t('analytics.regionMap.legendActive')}
          sx={{ fontSize: '0.65rem', height: 20, bgcolor: `${MARKER_COLOR_DEFAULT}22`, color: 'primary.main', fontWeight: 700 }}
        />
        {unmapped.length > 0 && (
          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
            {t('analytics.regionMap.unmapped', { count: unmapped.length })}
          </Typography>
        )}
      </Box>

      {/* Map */}
      <Box
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: mapBg,
          border: '1px solid',
          borderColor: 'divider',
          position: 'relative',
        }}
      >
        <ComposableMap
          projectionConfig={{ scale: 147, center: [10, 15] }}
          style={{ width: '100%', height: 'auto' }}
          height={360}
        >
          <ZoomableGroup zoom={1} minZoom={0.8} maxZoom={8}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={geoFill}
                    stroke={geoBorder}
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: { fill: isDark ? '#2a3f5a' : '#d0dce8', outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                ))
              }
            </Geographies>

            {markers.map((marker) => (
              <HeatmapMarker
                key={marker.region}
                marker={marker}
                active={activeRegion === marker.region}
                onEnter={() => setActiveRegion(marker.region)}
                onLeave={() => setActiveRegion(null)}
              />
            ))}
          </ZoomableGroup>
        </ComposableMap>

        {/* Floating tooltip */}
        {activeData && (
          <Box
            sx={{
              position: 'absolute',
              top: 16,
              right: 16,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              p: 1.5,
              minWidth: 160,
              boxShadow: 3,
              pointerEvents: 'none',
            }}
          >
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08rem', color: 'primary.main', mb: 0.5 }}>
              {activeData.region}
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>
              {activeData.count} {t('analytics.regionMap.items')}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {t('analytics.regionMap.valuation')} {activeData.valuation} €
            </Typography>
          </Box>
        )}

        {markers.length === 0 && (
          <Box sx={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
              {t('analytics.regionMap.noRegions')}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
