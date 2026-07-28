'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import { maturityReferenceClient } from '@/lib/maturity-references/client';
import type { MaturitySuggestion } from '@/lib/maturity-references/types';

interface MaturitySuggestionFieldProps {
  category: string;
  region?: string;
  color?: string;
  producer?: string;
  vintage?: string;
  onApply: (suggestion: MaturitySuggestion) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function MaturitySuggestionField({
  category,
  region,
  color,
  producer,
  vintage,
  onApply,
  t,
}: MaturitySuggestionFieldProps) {
  const [suggestion, setSuggestion] = useState<MaturitySuggestion | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimeoutRef.current !== null) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    if (category !== 'wine' && category !== 'sparkling') {
      setSuggestion(null);
      return;
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await maturityReferenceClient.suggest({
          category: category as 'wine' | 'sparkling' | 'spirit' | 'cigar',
          region,
          color,
          producer,
          vintage: vintage ? Number(vintage) : undefined,
        });
        setSuggestion(result);
      } catch {
        setSuggestion(null);
      }
    }, 600);

    return () => {
      if (debounceTimeoutRef.current !== null) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [category, region, color, producer, vintage]);

  const applySuggestion = () => {
    if (suggestion == null) {
      return;
    }

    onApply(suggestion);
    setSuggestion(null);
  };

  return (
    suggestion &&
    suggestion.peakMaturityFrom != null &&
    suggestion.peakMaturityTo != null && (
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
        <Button size="sm" color="primary" variant="flat" onPress={applySuggestion}>
          {t('inventory.maturitySuggestion.apply')}
        </Button>
      </div>
    )
  );
}
