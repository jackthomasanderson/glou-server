'use client';
import React, { useMemo } from 'react';
import { Select, SelectItem } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useStorageZones } from '@/hooks/useStorageZones';
import { StorageZone } from '@/lib/storage-zones/types';

/**
 * Build a flat list with depth-prefixed names for display in a <select>.
 */
function flattenZones(
  zones: StorageZone[],
  parentId: string | null = null,
  depth = 0
): Array<{ zone: StorageZone; label: string }> {
  const children = zones.filter((z) => (z.parentId ?? null) === parentId);
  const result: Array<{ zone: StorageZone; label: string }> = [];
  for (const z of children) {
    const prefix = depth > 0 ? '  '.repeat(depth) + '└ ' : '';
    result.push({ zone: z, label: `${prefix}${z.name}` });
    result.push(...flattenZones(zones, z.id, depth + 1));
  }
  return result;
}

interface StorageZoneSelectorProps {
  cellarId: string | null | undefined;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StorageZoneSelector({
  cellarId,
  value,
  onChange,
  label,
  size = 'sm',
}: StorageZoneSelectorProps) {
  const { t } = useTranslation();
  const { data: zones } = useStorageZones(cellarId ?? '');

  const flatOptions = useMemo(() => {
    if (!zones) return [];
    return flattenZones(zones);
  }, [zones]);

  if (!cellarId || !zones || zones.length === 0) return null;

  const selectedKey = value ?? 'none';

  return (
    <Select
      label={label ?? t('storageZones.selectorLabel')}
      variant="bordered"
      size={size}
      selectedKeys={[selectedKey]}
      onSelectionChange={(keys) => {
        const val = Array.from(keys)[0] as string;
        onChange(val === 'none' ? null : val);
      }}
    >
      <>
        <SelectItem key="none">
          <em>{t('storageZones.unclassified')}</em>
        </SelectItem>
        {flatOptions.map(({ zone, label: zonelabel }) => (
          <SelectItem key={zone.id}>{zonelabel}</SelectItem>
        ))}
      </>
    </Select>
  );
}
