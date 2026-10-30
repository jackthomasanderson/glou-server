import { describe, it, expect } from 'vitest';
import { redactUrlSecrets } from '../../src/lib/log-redact';

describe('redactUrlSecrets (#490)', () => {
  it('masks the guest share token in API paths', () => {
    expect(redactUrlSecrets('/api/guest/3f9a0c/inventory?x=1')).toBe('/api/guest/***/inventory?x=1');
  });

  it('masks guest and reset-password tokens in a referrer URL', () => {
    expect(redactUrlSecrets('https://glou.local/guest/abc123')).toBe('https://glou.local/guest/***');
    expect(redactUrlSecrets('https://glou.local/reset-password/tok?lang=fr')).toBe('https://glou.local/reset-password/***?lang=fr');
  });

  it('masks the token whatever the case of the route, since Express routes it anyway', () => {
    expect(redactUrlSecrets('/api/GUEST/3f9a0c/inventory')).toBe('/api/GUEST/***/inventory');
  });

  it('leaves other URLs untouched', () => {
    expect(redactUrlSecrets('/api/inventory/42')).toBe('/api/inventory/42');
    expect(redactUrlSecrets(undefined)).toBeUndefined();
  });
});
