'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InventoryCategory } from '@/lib/inventory/types';
import { maturityReferenceClient } from '@/lib/maturity-references/client';
import { MaturitySuggestion } from '@/lib/maturity-references/types';

interface MaturitySuggestionFieldProps {
  /** Whether the current category supports peak-maturity suggestions (wine/sparkling). */
  active: boolean;
  category?: InventoryCategory;
  region?: string | null;
  color?: string | null;
  producer?: string | null;
  vintage?: number | null;
  onApply: (peakMaturityFrom: number | null, peakMaturityTo: number | null) => void;
}

export function MaturitySuggestionField({
  active, category, region, color, producer, vintage, onApply,
}: MaturitySuggestionFieldProps) {
  const { t } = useTranslation();
  const [suggestion, setSuggestion] = useState<MaturitySuggestion | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !category) { setSuggestion(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await maturityReferenceClient.suggest({
          category: category as 'wine' | 'sparkling' | 'spirit' | 'cigar',
          region: region ?? undefined,
          color: color ?? undefined,
          producer: producer ?? undefined,
          vintage: vintage ?? undefined,
        });
        setSuggestion(result);
      } catch { setSuggestion(null); }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, category, region, color, producer, vintage]);

  const applySuggestion = () => {
    if (!suggestion) return;
    onApply(suggestion.peakMaturityFrom, suggestion.peakMaturityTo);
    setSuggestion(null);
  };

  if (!suggestion || suggestion.peakMaturityFrom == null || suggestion.peakMaturityTo == null) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-xl px-3 py-2">
      <Sparkles size={15} className="text-primary shrink-0" />
      <p className="flex-1 text-xs text-primary-700">
        <strong>{suggestion.reference.name}</strong>
        {' — '}
        {t('inventory.maturitySuggestion.window', {
          from: suggestion.peakMaturityFrom,
          to: suggestion.peakMaturityTo,
        })}
      </p>
      <Button size="sm" variant="flat" color="primary" onPress={applySuggestion}>
        {t('inventory.maturitySuggestion.apply')}
      </Button>
    </div>
  );
}
