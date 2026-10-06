import { describe, it, expect } from 'vitest';
import { isCookieSecure } from '../../src/lib/cookie-secure';

describe('isCookieSecure (#213)', () => {
  it('is false over plain http even in production (LAN / NAS install)', () => {
    expect(isCookieSecure({ NODE_ENV: 'production', APP_URL: 'http://192.168.1.20:3000' })).toBe(false);
  });

  it('is true when the public URL is https', () => {
    expect(isCookieSecure({ NODE_ENV: 'production', APP_URL: 'https://glou.example.org' })).toBe(true);
    expect(isCookieSecure({ APP_URL: 'HTTPS://glou.example.org' })).toBe(true);
  });

  it('lets COOKIE_SECURE override the URL either way', () => {
    expect(isCookieSecure({ APP_URL: 'http://glou.lan', COOKIE_SECURE: 'true' })).toBe(true);
    expect(isCookieSecure({ APP_URL: 'https://glou.example.org', COOKIE_SECURE: 'false' })).toBe(false);
  });

  it('ignores an empty COOKIE_SECURE (compose passes unset vars as "")', () => {
    expect(isCookieSecure({ APP_URL: 'https://glou.example.org', COOKIE_SECURE: '' })).toBe(true);
  });

  it('falls back to NODE_ENV when APP_URL is unset', () => {
    expect(isCookieSecure({ NODE_ENV: 'production' })).toBe(true);
    expect(isCookieSecure({ NODE_ENV: 'development' })).toBe(false);
  });
});
