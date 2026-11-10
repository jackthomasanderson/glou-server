'use client';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StarRatingProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Five-star score as a named radio group: each star announces its value and
 * whether it is the chosen one, and the score is also written as text ("4/5").
 * Pressing the chosen star again clears the score; the text, a live region,
 * announces the change.
 */
export function StarRating({ label, value, onChange }: StarRatingProps) {
  const { t } = useTranslation();
  const current = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5">
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={current === star}
            aria-label={t('tastings.ratingOption', { count: star })}
            onClick={() => onChange(current === star ? null : star)}
            className={`rounded-full p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary hover:bg-default-100 ${
              current >= star ? 'text-warning' : 'text-foreground-500'
            }`}
          >
            <Star size={18} fill={current >= star ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        ))}
      </div>
      <span role="status" className="text-sm font-semibold tabular-nums text-foreground-600">
        {value ? t('tastings.ratingValue', { value }) : t('tastings.ratingNone')}
      </span>
    </div>
  );
}
