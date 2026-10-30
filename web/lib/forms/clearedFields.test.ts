import { describe, it, expect } from 'vitest';
import { withClearedFields } from './clearedFields';

describe('withClearedFields (#726)', () => {
  it('sends null for a field emptied during the edit', () => {
    const initial = { vintage: 2015, purchasePrice: 20, color: 'red', name: 'Pétrus' };
    const values = { vintage: undefined, purchasePrice: undefined, color: undefined, name: 'Pétrus' };
    expect(withClearedFields(initial, values)).toEqual({ vintage: null, purchasePrice: null, color: null, name: 'Pétrus' });
    // ...and survives the JSON the PATCH is sent as.
    expect(JSON.parse(JSON.stringify(withClearedFields(initial, values)))).toHaveProperty('vintage', null);
  });

  it('leaves out a field that was already empty', () => {
    const out = withClearedFields({ vintage: null, region: undefined }, { vintage: undefined, region: undefined });
    expect(JSON.parse(JSON.stringify(out))).toEqual({});
  });

  it('keeps every other value as is, including 0 and empty strings', () => {
    const initial = { fillLevel: 50, notes: 'x', quantity: 3 };
    const values = { fillLevel: 0, notes: '', quantity: 3 };
    expect(withClearedFields(initial, values)).toEqual(values);
  });

  it('changes nothing for a creation (no initial values)', () => {
    const values = { vintage: undefined };
    expect(withClearedFields(undefined, values)).toBe(values);
  });
});
