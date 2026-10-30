import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiRateLimitMax, DEFAULT_API_RATE_LIMIT_MAX } from '../../src/lib/rate-limit-max';

describe('apiRateLimitMax', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the production default of 1000 when unset', () => {
    expect(DEFAULT_API_RATE_LIMIT_MAX).toBe(1000);
    expect(apiRateLimitMax({})).toBe(1000);
  });

  it('treats an empty value as unset, without a warning (compose passes unset vars as "")', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(apiRateLimitMax({ API_RATE_LIMIT_MAX: '' })).toBe(1000);
    expect(apiRateLimitMax({ API_RATE_LIMIT_MAX: '   ' })).toBe(1000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts a positive whole number', () => {
    expect(apiRateLimitMax({ API_RATE_LIMIT_MAX: '100000' })).toBe(100000);
    expect(apiRateLimitMax({ API_RATE_LIMIT_MAX: ' 50 ' })).toBe(50);
    expect(apiRateLimitMax({ API_RATE_LIMIT_MAX: '1' })).toBe(1);
  });

  it.each(['0', '-5', '1.5', '1e6', 'abc', '10k', '0x10', '99999999999999999999'])(
    'falls back to the default, with a warning, for %j',
    (value) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(apiRateLimitMax({ API_RATE_LIMIT_MAX: value })).toBe(DEFAULT_API_RATE_LIMIT_MAX);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('API_RATE_LIMIT_MAX');
    },
  );
});
