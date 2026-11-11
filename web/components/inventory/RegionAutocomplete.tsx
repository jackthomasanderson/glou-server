'use client';
import React, { useId, useMemo, useState } from 'react';
import { Input, Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useProducts } from '@/hooks/useProducts';
import { useComboboxKeys, optionDomId } from '@/hooks/useComboboxKeys';
import { KNOWN_REGION_NAMES, findKnownRegion, normalizeRegionName } from '@shared/map-location';

/** Suggestions shown at once: enough to choose from, short enough on a phone. */
const MAX_SUGGESTIONS = 8;

interface Props {
  value: string;
  onChange: (region: string) => void;
  label: string;
}

interface RegionOption {
  label: string;
  /** Used in the cellar but unknown to the map. */
  notOnMap: boolean;
}

/**
 * #961: the Region field stays free text, with suggestions — the regions
 * already used in the cellar (most used first, an unknown one flagged "not on
 * the map"), then the names the Analytics map can place. Same combobox pattern
 * as ProducerAutocomplete. A region the map cannot place is said under the
 * field, never blocking the save.
 */
export function RegionAutocomplete({ value, onChange, label }: Props) {
  const { t } = useTranslation();
  const { data: products } = useProducts();
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);

  // The cellar's regions, once per place, under the map's name when it knows it.
  const cellarRegions = useMemo<RegionOption[]>(() => {
    const byKey = new Map<string, { option: RegionOption; uses: number }>();
    for (const product of products ?? []) {
      const region = product.region?.trim();
      if (!region) continue;
      const key = normalizeRegionName(region);
      const entry = byKey.get(key);
      if (entry) {
        entry.uses += 1;
        continue;
      }
      const known = findKnownRegion(region);
      byKey.set(key, { option: { label: known?.name ?? region, notOnMap: !known }, uses: 1 });
    }
    return Array.from(byKey.values())
      .sort((a, b) => b.uses - a.uses || a.option.label.localeCompare(b.option.label))
      .map(({ option }) => option);
  }, [products]);

  const options = useMemo<RegionOption[]>(() => {
    const query = normalizeRegionName(value);
    if (!query) return cellarRegions.slice(0, MAX_SUGGESTIONS);
    const seen = new Set<string>();
    const result: RegionOption[] = [];
    const candidates = [...cellarRegions, ...KNOWN_REGION_NAMES.map((label) => ({ label, notOnMap: false }))];
    for (const option of candidates) {
      const key = normalizeRegionName(option.label);
      if (seen.has(key) || !key.includes(query)) continue;
      seen.add(key);
      result.push(option);
      if (result.length === MAX_SUGGESTIONS) break;
    }
    return result;
  }, [value, cellarRegions]);

  const pick = (region: string) => {
    onChange(region);
    setIsOpen(false);
  };

  const keys = useComboboxKeys(options, {
    isOpen,
    open: () => setIsOpen(true),
    dismiss: () => setIsOpen(false),
    pick: (o) => pick(o.label),
  });
  const expanded = isOpen && options.length > 0;
  const notRecognised = value.trim() !== '' && !findKnownRegion(value);

  return (
    <div className="relative">
      <Input
        fullWidth
        variant="bordered"
        size="sm"
        label={label}
        value={value}
        description={notRecognised ? t('inventory.fields.regionUnknown') : t('inventory.fields.regionHelp')}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-activedescendant={expanded && keys.activeIndex >= 0 ? optionDomId(listId, keys.activeIndex) : undefined}
        onValueChange={(v) => { onChange(v); setIsOpen(true); keys.resetActive(); }}
        onFocus={() => setIsOpen(true)}
        // Rows never take focus (aria-activedescendant): a blur means the user left.
        onBlur={() => { setIsOpen(false); keys.resetActive(); }}
        onKeyDown={keys.onKeyDown}
      />

      {expanded && (
        <div className="absolute z-[1500] left-0 top-full mt-1 w-full bg-background border border-default-200 rounded-xl shadow-xl overflow-hidden">
          <ul id={listId} role="listbox" aria-label={label} className="py-1">
            {options.map((opt, idx) => (
              <li
                key={opt.label}
                id={optionDomId(listId, idx)}
                role="option"
                aria-selected={idx === keys.activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt.label)}
                onMouseEnter={() => keys.setActiveIndex(idx)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${idx === keys.activeIndex ? 'bg-default-100' : 'hover:bg-default-100'}`}
              >
                <span className="text-sm font-semibold">{opt.label}</span>
                {opt.notOnMap && (
                  <Chip size="sm" variant="bordered" color="default" classNames={{ base: 'h-[18px]', content: 'text-xs px-1.5' }}>
                    {t('autocomplete.notOnMap')}
                  </Chip>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
