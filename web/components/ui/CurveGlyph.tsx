'use client';
import { CURVE_SHAPE_GLYPH, type CurveShape } from '@/lib/maturity-references/curve';

interface CurveGlyphProps {
  shape: CurveShape;
  /** Pixel width; height keeps the 100:28 ratio. */
  width?: number;
  className?: string;
  title?: string;
}

/**
 * FEAT-86 — a small, purely illustrative sketch of a consumption-curve shape.
 * Decorative: the real readiness numbers come from the API, this only helps
 * the reader picture "early bell" vs "late bell" at a glance.
 */
export function CurveGlyph({ shape, width = 44, className, title }: CurveGlyphProps) {
  const height = Math.round((width * 28) / 100);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 28"
      fill="none"
      className={className}
      role="img"
      aria-label={title ?? shape}
    >
      {title ? <title>{title}</title> : null}
      <path
        d={CURVE_SHAPE_GLYPH[shape]}
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
