'use client';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { client } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { ProductSuggestion } from '@/lib/inventory/productSearch';
import { SuggestionAutocomplete } from './SuggestionAutocomplete';

interface Props {
  value: string;
  onChange: (name: string) => void;
  onSelect: (s: ProductSuggestion) => void;
  category: string;
  /** Off: a plain name field, nothing looked up or proposed (an existing bottle's name, #643). */
  suggestions?: boolean;
  autoFocus?: boolean;
  isInvalid?: boolean;
  /** Said under the field when it is invalid; "required" when absent. */
  errorMessage?: string;
}

export function ProductAutocomplete({ value, onChange, onSelect, category, suggestions = true, autoFocus, isInvalid, errorMessage }: Props) {
  const { t, i18n } = useTranslation();
  const { data: inventoryItems } = useInventory();

  const internalOptions = useMemo<ProductSuggestion[]>(() => {
    if (!suggestions || !value.trim() || !inventoryItems) return [];
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    return inventoryItems
      .filter((item) => {
        const key = `${item.name}|${item.producer}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return item.name.toLowerCase().includes(q) || item.producer.toLowerCase().includes(q);
      })
      .slice(0, 5)
      .map((item) => ({
        source: 'internal' as const,
        name: item.name,
        producer: item.producer,
        category: item.category,
        vintage: item.vintage,
        bottleSize: item.bottleSize,
        format: item.format,
        region: item.region,
      }));
  }, [suggestions, value, inventoryItems]);

  return (
    <SuggestionAutocomplete<ProductSuggestion>
      value={value}
      onChange={onChange}
      onSelect={onSelect}
      suggestions={suggestions}
      internalOptions={internalOptions}
      queryKey={(text) => qk.suggestions.products(category, i18n.language, text)}
      fetchSuggestions={async (q) => {
        const { data } = await client.get<ProductSuggestion[]>(
          `/search/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&lang=${i18n.language}`,
        );
        return data.map((s) => ({ ...s, source: 'external' as const }));
      }}
      getKey={(o) => `${o.name}-${o.producer}`}
      getText={(o) => o.name}
      listLabel={t('inventory.fields.name')}
      renderOption={(o, chip) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{o.name}</span>
            {chip}
          </div>
          <span className="text-xs text-foreground-500">
            {o.producer}{o.vintage ? ` · ${o.vintage}` : ''}
          </span>
        </div>
      )}
      testId="inventory-name-input"
      inputProps={{
        isRequired: true,
        isInvalid,
        errorMessage: isInvalid ? errorMessage ?? t('inventory.validation.required') : undefined,
        label: t('inventory.fields.name'),
        // #701: like the producer field, an example of what goes here.
        placeholder: t(`inventory.fields.namePlaceholder.${category}`),
        autoFocus,
      }}
    />
  );
}
