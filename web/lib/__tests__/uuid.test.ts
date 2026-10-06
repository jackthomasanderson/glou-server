import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomId } from '../uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomId (#213)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a v4 UUID', () => {
    expect(randomId()).toMatch(V4);
  });

  it('still returns a v4 UUID when crypto.randomUUID is unavailable (plain HTTP)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const a = randomId();
    const b = randomId();
    expect(a).toMatch(V4);
    expect(a).not.toBe(b);
  });
});
