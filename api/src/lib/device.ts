import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';

/** Structured device info — callers compose the localized label themselves (ISSUE_023). */
export interface DeviceDescription {
  browser: string | null;
  os: string | null;
}

/**
 * Extract the browser/OS names from a raw User-Agent string, e.g.
 * `{ browser: 'Chrome', os: 'Windows' }`. Returns `null` for either field
 * when unknown, leaving localization to the caller.
 *
 * ua-parser-js v1.x exposes a class (`new UAParser(ua).getResult()`), not the
 * functional call from the deprecated v0.x API — using the old call style
 * compiles fine locally against stale/absent types but fails `tsc` in CI
 * once real declaration files are resolved. Ships its own .d.ts since 1.0.2,
 * so no separate @types package is needed or should be installed.
 */
export function describeDevice(userAgent: string | undefined | null): DeviceDescription {
  if (!userAgent) return { browser: null, os: null };
  const { browser, os } = new UAParser(userAgent).getResult();
  return { browser: browser.name ?? null, os: os.name ?? null };
}

/**
 * Approximate geo-location from an IP address using a local, offline
 * database (no third-party call — privacy-respecting by design).
 * Returns null for private/loopback IPs or unresolvable addresses.
 */
export function locateIp(ip: string | undefined | null): { city: string | null; country: string | null } | null {
  if (!ip || ip === 'unknown') return null;
  // Strip IPv6-mapped-IPv4 prefix if present
  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const result = geoip.lookup(cleanIp);
  if (!result) return null;
  return { city: result.city || null, country: result.country || null };
}

/** ISO country code only, used for trusted-device anomaly detection. */
export function countryOfIp(ip: string | undefined | null): string | null {
  return locateIp(ip)?.country ?? null;
}
