'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InventoryCategory } from '@/lib/inventory/types';
import { maturityReferenceClient } from '@/lib/maturity-references/client';
import { MaturitySuggestion } from '@/lib/maturity-references/types';
import { curveShapeLabelKey, type CurveShape } from '@/lib/maturity-references/curve';
import { CurveGlyph } from '@/components/ui/CurveGlyph';

interface MaturitySuggestionFieldProps {
  /** Whether the current category supports peak-maturity suggestions (wine/sparkling). */
  active: boolean;
  category?: InventoryCategory;
  region?: string | null;
  color?: string | null;
  producer?: string | null;
  vintage?: number | null;
  onApply: (
    peakMaturityFrom: number | null,
    peakMaturityTo: number | null,
    curveShape: CurveShape | null,
  ) => void;
}

export function MaturitySuggestionField({
  active, category, region, color, producer, vintage, onApply,
}: MaturitySuggestionFieldProps) {
  const { t } = useTranslation();
  const [suggestion, setSuggestion] = useState<MaturitySuggestion | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing the suggestion when the field becomes inactive is adjusted
  // during render (React's documented pattern) rather than in the fetch
  // effect below, so the effect itself only needs to handle the actual
  // async side effect (the debounced suggest() call).
  const [prevActive, setPrevActive] = useState(active);
  const [prevCategory, setPrevCategory] = useState(category);
  if (active !== prevActive || category !== prevCategory) {
    setPrevActive(active);
    setPrevCategory(category);
    if (!active || !category) setSuggestion(null);
  }

  useEffect(() => {
    if (!active || !category) return;
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
  }, [active, category, region, color, producer, vintage]);

  const applySuggestion = () => {
    if (!suggestion) return;
    onApply(suggestion.peakMaturityFrom, suggestion.peakMaturityTo, suggestion.curveShape ?? null);
    setSuggestion(null);
  };

  if (!suggestion || suggestion.peakMaturityFrom == null || suggestion.peakMaturityTo == null) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-xl px-3 py-2">
      <Sparkles size={15} className="text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-primary-700">
          <strong>{suggestion.reference.name}</strong>
          {' — '}
          {t('inventory.maturitySuggestion.window', {
            from: suggestion.peakMaturityFrom,
            to: suggestion.peakMaturityTo,
          })}
        </p>
        {suggestion.curveShape && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-primary-600">
            <CurveGlyph shape={suggestion.curveShape} width={30} />
            {t(curveShapeLabelKey(suggestion.curveShape))}
          </span>
        )}
      </div>
      <Button size="sm" variant="flat" color="primary" onPress={applySuggestion}>
        {t('inventory.maturitySuggestion.apply')}
      </Button>
    </div>
  );
}
