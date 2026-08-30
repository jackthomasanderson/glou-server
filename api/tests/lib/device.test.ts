import { describe, it, expect } from 'vitest';
import { describeDevice, locateIp, countryOfIp } from '../../src/lib/device';

describe('describeDevice', () => {
  it('falls back to a French label for a missing UA', () => {
    expect(describeDevice(undefined)).toBe('Appareil inconnu');
    expect(describeDevice(null)).toBe('Appareil inconnu');
    expect(describeDevice('')).toBe('Appareil inconnu');
  });

  it('formats "<browser> sur <os>" for a real UA string', () => {
    const chromeWin =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const label = describeDevice(chromeWin);
    expect(label).toMatch(/^Chrome sur Windows/);
    expect(label).toContain(' sur ');
  });

  it('degrades gracefully on an unrecognizable UA', () => {
    const label = describeDevice('totally-not-a-user-agent');
    expect(label).toContain(' sur ');
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
