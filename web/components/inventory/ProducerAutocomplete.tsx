'use client';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '@/hooks/useInventory';
import { client } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { SuggestionAutocomplete, type SuggestionOption } from './SuggestionAutocomplete';

interface Props {
  value: string;
  onChange: (producer: string) => void;
  category: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  isInvalid?: boolean;
  /** Said under the field when it is invalid; "required" when absent. */
  errorMessage?: string;
}

interface ProducerOption extends SuggestionOption {
  label: string;
}

const sameProducer = (external: ProducerOption, internal: ProducerOption[]) =>
  internal.some((i) => i.label.toLowerCase() === external.label.toLowerCase());

export function ProducerAutocomplete({ value, onChange, category, label, placeholder, required, isInvalid, errorMessage }: Props) {
  const { t, i18n } = useTranslation();
  const { data: inventoryItems } = useInventory();

  const internalOptions = useMemo<ProducerOption[]>(() => {
    if (!value.trim() || !inventoryItems) return [];
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    return inventoryItems
      .filter((item) => {
        const p = item.producer.toLowerCase();
        if (!p.includes(q) || seen.has(p)) return false;
        seen.add(p);
        return true;
      })
      .slice(0, 4)
      .map((item) => ({ label: item.producer, source: 'internal' as const }));
  }, [value, inventoryItems]);

  return (
    <SuggestionAutocomplete<ProducerOption>
      value={value}
      onChange={onChange}
      onSelect={() => {}}
      internalOptions={internalOptions}
      queryKey={(text) => qk.suggestions.producers(category, i18n.language, text)}
      fetchSuggestions={async (q) => {
        const { data } = await client.get<string[]>(
          `/search/producers?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&lang=${i18n.language}`,
        );
        return (data ?? []).map((p) => ({ label: p, source: 'external' as const }));
      }}
      isDuplicate={sameProducer}
      getKey={(o) => o.label}
      getText={(o) => o.label}
      listLabel={label}
      renderOption={(o, chip) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{o.label}</span>
          {chip}
        </div>
      )}
      testId="inventory-producer-input"
      inputProps={{
        isRequired: required,
        isInvalid,
        errorMessage: isInvalid ? errorMessage ?? t('inventory.validation.required') : undefined,
        label,
        placeholder,
      }}
    />
  );
}
