import { describe, it, expect } from 'vitest';
import {
  readinessIndex,
  readinessPercent,
  distributionWeight,
  CURVE_SHAPES,
} from '../../src/lib/maturity-curve';

describe('maturity-curve — readinessIndex', () => {
  it('returns null when no window is defined', () => {
    expect(readinessIndex({ shape: 'BELL', from: null, to: null })).toBeNull();
    expect(readinessPercent({ shape: null, from: undefined, to: undefined })).toBeNull();
  });

  it('is 0 well before the lead-in and 0 well after the decay', () => {
    const w = { from: 2030, to: 2040 } as const;
    expect(readinessIndex({ shape: 'LINEAR', ...w, year: 2020 })).toBe(0);
    expect(readinessIndex({ shape: 'LINEAR', ...w, year: 2050 })).toBe(0);
  });

  it('every shape stays within [0, 1] across a wide year sweep', () => {
    for (const shape of CURVE_SHAPES) {
      for (let year = 2025; year <= 2055; year++) {
        const v = readinessIndex({ shape, from: 2035, to: 2045, year })!;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('PLATEAU is flat at 1 across the whole window', () => {
    for (let year = 2035; year <= 2045; year++) {
      expect(readinessIndex({ shape: 'PLATEAU', from: 2035, to: 2045, year })).toBe(1);
    }
  });

  it('LINEAR never declines inside the window', () => {
    let prev = -1;
    for (let year = 2035; year <= 2045; year++) {
      const v = readinessIndex({ shape: 'LINEAR', from: 2035, to: 2045, year })!;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('LATE_BELL peaks nearer the end than EARLY_BELL', () => {
    const from = 2030;
    const to = 2050;
    const argmax = (shape: 'EARLY_BELL' | 'LATE_BELL') => {
      let bestYear = from;
      let best = -1;
      for (let year = from; year <= to; year++) {
        const v = readinessIndex({ shape, from, to, year })!;
        if (v > best) {
          best = v;
          bestYear = year;
        }
      }
      return bestYear;
    };
    expect(argmax('LATE_BELL')).toBeGreaterThan(argmax('EARLY_BELL'));
  });

  it('BELL peaks around the middle of the window', () => {
    const peak = readinessIndex({ shape: 'BELL', from: 2030, to: 2040, year: 2035 })!;
    const edge = readinessIndex({ shape: 'BELL', from: 2030, to: 2040, year: 2040 })!;
    expect(peak).toBeGreaterThan(edge);
    expect(peak).toBeGreaterThan(0.9);
  });

  it('TWIN_PEAK dips in the middle below both a young and a mature sampling', () => {
    const from = 2030;
    const to = 2050;
    const young = readinessIndex({ shape: 'TWIN_PEAK', from, to, year: 2033 })!;
    const trough = readinessIndex({ shape: 'TWIN_PEAK', from, to, year: 2040 })!;
    const mature = readinessIndex({ shape: 'TWIN_PEAK', from, to, year: 2047 })!;
    expect(trough).toBeLessThan(young);
    expect(trough).toBeLessThan(mature);
  });

  it('falls back to LINEAR behaviour when shape is null', () => {
    for (let year = 2030; year <= 2040; year++) {
      const asNull = readinessIndex({ shape: null, from: 2030, to: 2040, year });
      const asLinear = readinessIndex({ shape: 'LINEAR', from: 2030, to: 2040, year });
      expect(asNull).toBe(asLinear);
    }
  });

  it('handles a single-year window without dividing by zero', () => {
    const v = readinessIndex({ shape: 'BELL', from: 2035, to: 2035, year: 2035 });
    expect(v).not.toBeNull();
    expect(Number.isFinite(v as number)).toBe(true);
  });

  it('readinessPercent is the rounded index times 100', () => {
    const idx = readinessIndex({ shape: 'LATE_BELL', from: 2030, to: 2040, year: 2037 })!;
    expect(readinessPercent({ shape: 'LATE_BELL', from: 2030, to: 2040, year: 2037 })).toBe(
      Math.round(idx * 100),
    );
  });

  it('distributionWeight is 0 outside the envelope and positive inside', () => {
    expect(distributionWeight({ shape: 'BELL', from: 2030, to: 2040, year: 2000 })).toBe(0);
    expect(distributionWeight({ shape: 'BELL', from: 2030, to: 2040, year: 2035 })).toBeGreaterThan(0);
  });
});
