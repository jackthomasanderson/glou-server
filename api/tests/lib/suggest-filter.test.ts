import { describe, it, expect } from 'vitest';
import { isCommercial, PRODUCER_EXTRA_TERMS } from '../../src/lib/suggest-filter';

describe('isCommercial (#481)', () => {
  it('keeps producers whose name merely contains a banned term', () => {
    expect(isCommercial('Alfred Gratien', PRODUCER_EXTRA_TERMS)).toBe(false);
    expect(isCommercial('Notre-Dame de Quatourze', PRODUCER_EXTRA_TERMS)).toBe(false);
    expect(isCommercial('Rosemont Estate', PRODUCER_EXTRA_TERMS)).toBe(false);
    expect(isCommercial('Salentein', PRODUCER_EXTRA_TERMS)).toBe(false);
  });

  it('still rejects suggestions with a banned whole word', () => {
    expect(isCommercial('margaux prix 2015')).toBe(true);
    expect(isCommercial('château margaux avis')).toBe(true);
    expect(isCommercial('domaine x rosé', PRODUCER_EXTRA_TERMS)).toBe(true);
    expect(isCommercial('krug brut', PRODUCER_EXTRA_TERMS)).toBe(true);
  });

  it('only applies producer terms when asked', () => {
    expect(isCommercial('krug brut')).toBe(false);
  });
});
