'use client';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StarRatingProps {
  /** Id of the visible label element naming the group. */
  labelId: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

const STARS = [1, 2, 3, 4, 5] as const;
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-focus';

/**
 * Five-star score as a radio group (WAI-ARIA radio pattern): one tab stop (the
 * chosen star, or the first), arrow keys move and choose, Home/End jump. The
 * score is also written as text ("4/5") and can be cleared with its own button;
 * pressing the chosen star again keeps it.
 */
export function StarRating({ labelId, value, onChange }: StarRatingProps) {
  const { t } = useTranslation();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = value ?? 0;

  const choose = (star: number) => {
    onChange(star);
    refs.current[star - 1]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = current || 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = from === 5 ? 1 : (current ? from + 1 : 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = from === 1 ? 5 : from - 1;
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = 5;
    if (next === null) return;
    e.preventDefault();
    choose(next);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown} className="flex items-center">
        {STARS.map((star) => (
          <button
            key={star}
            ref={(el) => { refs.current[star - 1] = el; }}
            type="button"
            role="radio"
            aria-checked={current === star}
            aria-label={t('tastings.ratingOption', { count: star })}
            tabIndex={star === (current || 1) ? 0 : -1}
            onClick={() => onChange(star)}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-default-100 ${FOCUS_RING} ${
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
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`text-xs text-foreground-500 underline rounded px-1 py-2 ${FOCUS_RING}`}
        >
          {t('tastings.ratingClear')}
        </button>
      ) : null}
    </div>
  );
}
