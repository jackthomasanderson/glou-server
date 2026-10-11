import { describe, it, expect } from 'vitest';
import { describeDevice, locateIp, countryOfIp } from '../../src/lib/device';

describe('describeDevice', () => {
  it('returns null fields for a missing UA', () => {
    expect(describeDevice(undefined)).toEqual({ browser: null, os: null });
    expect(describeDevice(null)).toEqual({ browser: null, os: null });
    expect(describeDevice('')).toEqual({ browser: null, os: null });
  });

  it('extracts browser and os from a real UA string', () => {
    const chromeWin =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const { browser, os } = describeDevice(chromeWin);
    expect(browser).toBe('Chrome');
    expect(os).toMatch(/^Windows/);
  });

  it('degrades gracefully on an unrecognizable UA', () => {
    const { browser, os } = describeDevice('totally-not-a-user-agent');
    expect(browser).toBeNull();
    expect(os).toBeNull();
  });
});

describe('locateIp / countryOfIp', () => {
  it('returns null for private, loopback, unknown or missing IPs', () => {
    for (const ip of [undefined, null, 'unknown', '127.0.0.1', '192.168.1.10', '10.0.0.1']) {
      expect(locateIp(ip)).toBeNull();
      expect(countryOfIp(ip)).toBeNull();
    }
  });

  it('strips an IPv6-mapped-IPv4 prefix before lookup', () => {
    // ::ffff:127.0.0.1 -> 127.0.0.1 -> still private -> null (no throw)
    expect(locateIp('::ffff:127.0.0.1')).toBeNull();
  });
});
