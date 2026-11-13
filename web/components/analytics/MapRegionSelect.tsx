'use client';

import React from 'react';
import { SelectItem } from '@heroui/react';
import { SingleSelect } from '@/components/ui/SingleSelect';

// #378: the keyboard equivalent of clicking a marker on the map. Shared by the
// filter sidebar and the full-screen map (FEAT-114), where the sidebar is hidden.

const ALL_REGIONS_KEY = '__all__';

interface MapRegionSelectProps {
  /** Regions present in the data. */
  regions: string[];
  selectedRegion: string | null;
  onRegionChange: (region: string | null) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  className?: string;
}

export function MapRegionSelect({ regions, selectedRegion, onRegionChange, t, className }: MapRegionSelectProps) {
  return (
    <SingleSelect
      size="sm"
      radius="md"
      variant="bordered"
      label={t('analytics.map.filters.region')}
      selectedKeys={[selectedRegion ?? ALL_REGIONS_KEY]}
      onSelectionChange={(keys) => {
        const next = Array.from(keys)[0] as string | undefined;
        onRegionChange(next && next !== ALL_REGIONS_KEY ? next : null);
      }}
      aria-label={t('analytics.map.filters.region')}
      className={className}
    >
      {[
        <SelectItem key={ALL_REGIONS_KEY}>{t('analytics.map.filters.regionAny')}</SelectItem>,
        ...regions.map((region) => <SelectItem key={region}>{region}</SelectItem>),
      ]}
    </SingleSelect>
  );
}
