import { describe, it, expect } from 'vitest';
import { isBlockedAddress, assertUrlAllowed } from '../../src/lib/ssrf';

describe('isBlockedAddress', () => {
  it('blocks IPv4 private / loopback / link-local / CGNAT / reserved ranges', () => {
    for (const ip of [
      '0.0.0.0',
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '192.0.0.1',
      '198.18.0.1',
      '224.0.0.1', // multicast
      '255.255.255.255',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows ordinary public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it('blocks IPv6 loopback / ULA / link-local / mapped-IPv4 forms', () => {
    for (const ip of [
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      'ff02::1',
      '2001:db8::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::7f00:1',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows a public IPv6 (Google DNS)', () => {
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false);
  });

  it('treats a non-IP literal as blocked', () => {
    expect(isBlockedAddress('example.com')).toBe(true);
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('assertUrlAllowed', () => {
  it('rejects non-https schemes', async () => {
    await expect(assertUrlAllowed('http://example.com/x.jpg')).rejects.toThrow('INVALID_URL');
    await expect(assertUrlAllowed('ftp://example.com')).rejects.toThrow('INVALID_URL');
  });

  it('rejects embedded credentials', async () => {
    await expect(assertUrlAllowed('https://user:pass@example.com')).rejects.toThrow('INVALID_URL');
  });

  it('rejects an unparseable URL', async () => {
    await expect(assertUrlAllowed('not a url')).rejects.toThrow('INVALID_URL');
  });

  it('rejects an https URL pointing straight at a private IP literal', async () => {
    await expect(assertUrlAllowed('https://127.0.0.1/x')).rejects.toThrow('INVALID_URL');
    await expect(assertUrlAllowed('https://169.254.169.254/latest/meta-data')).rejects.toThrow('INVALID_URL');
  });

  it('rejects a hostname that resolves to loopback', async () => {
    await expect(assertUrlAllowed('https://localhost/x')).rejects.toThrow('INVALID_URL');
  });
});
