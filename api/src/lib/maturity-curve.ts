/**
 * FEAT-86 — Consumption / aging curve model.
 *
 * A curve turns a bottle's peak-maturity window (`peakMaturityFrom` /
 * `peakMaturityTo`, calendar years) into a *readiness index* in [0, 1] for a
 * given year: how close the bottle is, that year, to the way its owner wants
 * to drink it.
 *
 * The index is fully deterministic — it is derived from the window bounds and
 * the constants below, with no third-party input. It is a decision aid, NOT
 * an oenological fact (see .vibe/features/.../FEAT-86/feature.md).
 *
 * Single source of truth. Consumers:
 *  - alert.service.ts            — readiness shown alongside the coarse AlertStatus
 *  - inventory.service.ts        — readiness attached to list / detail payloads
 *  - consumption-plan.service.ts — weights the "drink now" suggestion ordering
 *  - analytics.service.ts        — weights the garde-histogram distribution
 */

export const CURVE_SHAPES = [
  'LINEAR',
  'BELL',
  'EARLY_BELL',
  'LATE_BELL',
  'TWIN_PEAK',
  'PLATEAU',
] as const;

export type CurveShape = (typeof CURVE_SHAPES)[number];

export const DEFAULT_CURVE_SHAPE: CurveShape = 'LINEAR';

/** Years before `peakMaturityFrom` over which readiness ramps up from ~0. */
export const LEAD_IN_YEARS = 2;
/** Years after `peakMaturityTo` over which readiness decays back to 0. */
export const DECAY_YEARS = 3;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function gaussian(t: number, center: number, width: number): number {
  const z = (t - center) / width;
  return Math.exp(-(z * z));
}

/**
 * Shape core: readiness for a normalized position `t` in [0, 1] across the
 * window ([0] = window start, [1] = window end).
 *
 * Every in-window shape is floored so the window edges never read as a hard 0
 * — a bottle inside its stated window is always at least "drinkable". The one
 * exception is the TWIN_PEAK trough, which is meant to dip visibly (a Chenin
 * drunk in its awkward middle phase disappoints — that is the whole point of
 * the shape).
 */
function shapeCore(shape: CurveShape, t: number): number {
  switch (shape) {
    case 'PLATEAU':
      return 1;
    case 'LINEAR':
      // Monotonic rise, no decline: the youngest end is already drinkable,
      // the oldest end is best. This is the safe fallback shape.
      return 0.55 + 0.45 * t;
    case 'BELL':
      return 0.45 + 0.55 * gaussian(t, 0.5, 0.3);
    case 'EARLY_BELL':
      return 0.4 + 0.6 * gaussian(t, 0.28, 0.26);
    case 'LATE_BELL':
      return 0.4 + 0.6 * gaussian(t, 0.72, 0.26);
    case 'TWIN_PEAK': {
      const youthful = gaussian(t, 0.14, 0.13);
      const mature = gaussian(t, 0.82, 0.16);
      // Floor 0.3 → the mid-window trough lands around ~0.4, clearly below
      // both peaks without implying the bottle is undrinkable.
      return 0.3 + 0.7 * Math.max(youthful, mature);
    }
    default:
      return 0.55 + 0.45 * t;
  }
}

export interface ReadinessInput {
  shape: CurveShape | null | undefined;
  from: number | null | undefined;
  to: number | null | undefined;
  /** Defaults to the current calendar year. */
  year?: number;
}

/**
 * Readiness index in [0, 1], or `null` when no window is defined at all
 * (nothing to build a curve on — the caller falls back to the coarse status).
 *
 * Outside the window: a `LEAD_IN_YEARS` ramp before it opens and a
 * `DECAY_YEARS` decay after it closes. Inside: shape-dependent.
 */
export function readinessIndex({ shape, from, to, year }: ReadinessInput): number | null {
  if (from == null && to == null) return null;

  const lo = from ?? (to as number);
  const hi = to ?? (from as number);
  const y = year ?? new Date().getFullYear();
  const curve = shape ?? DEFAULT_CURVE_SHAPE;

  if (y < lo) {
    if (y <= lo - LEAD_IN_YEARS) return 0;
    const progress = (y - (lo - LEAD_IN_YEARS)) / LEAD_IN_YEARS; // 0..1
    return clamp01(progress * shapeCore(curve, 0));
  }

  if (y > hi) {
    if (y >= hi + DECAY_YEARS) return 0;
    const remaining = 1 - (y - hi) / DECAY_YEARS; // 1..0
    return clamp01(remaining * shapeCore(curve, 1));
  }

  const span = hi - lo;
  const t = span <= 0 ? 0.5 : (y - lo) / span;
  return clamp01(shapeCore(curve, t));
}

/** Readiness as an integer percentage in [0, 100], or `null`. */
export function readinessPercent(input: ReadinessInput): number | null {
  const idx = readinessIndex(input);
  return idx == null ? null : Math.round(idx * 100);
}

/**
 * Weight to give a bottle in a per-year distribution (garde histogram): the
 * readiness index, or a flat `1` when the bottle has a window but no
 * meaningful curve position for that year (keeps totals stable). Years fully
 * outside the lead-in / decay envelope contribute 0.
 */
export function distributionWeight(input: ReadinessInput): number {
  const idx = readinessIndex(input);
  return idx == null ? 0 : idx;
}
