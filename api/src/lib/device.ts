import { readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import { UAParser } from 'ua-parser-js';
import { Reader, type CityResponse } from 'mmdb-lib';

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

// DB-IP "IP to City Lite" (CC BY 4.0), downloaded at Docker build time (#434).
const DEFAULT_GEO_DB_PATH = '/app/geo/dbip-city-lite.mmdb';

// Private, loopback, link-local and CGNAT ranges never resolve to a place.
const PRIVATE_RANGES = new BlockList();
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]] as const) {
  PRIVATE_RANGES.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [['::', 127], ['fc00::', 7], ['fe80::', 10]] as const) {
  PRIVATE_RANGES.addSubnet(net, prefix, 'ipv6');
}

// undefined = not loaded yet, null = unavailable (warned once).
let reader: Reader<CityResponse> | null | undefined;

function geoReader(): Reader<CityResponse> | null {
  if (reader !== undefined) return reader;
  const path = process.env.GEO_DB_PATH || DEFAULT_GEO_DB_PATH;
  try {
    reader = new Reader<CityResponse>(readFileSync(path));
  } catch (err) {
    console.warn(`[geo] IP geolocation disabled, cannot read ${path}: ${(err as Error).message}`);
    reader = null;
  }
  return reader;
}

/**
 * Approximate geo-location from an IP address using a local, offline
 * database (no third-party call — privacy-respecting by design).
 * Returns null for private/loopback IPs, unresolvable addresses, or when the
 * database is missing (development, tests).
 */
export function locateIp(ip: string | undefined | null): { city: string | null; country: string | null } | null {
  if (!ip || ip === 'unknown') return null;
  // Strip IPv6-mapped-IPv4 prefix if present
  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const family = isIP(cleanIp);
  if (family === 0 || PRIVATE_RANGES.check(cleanIp, family === 4 ? 'ipv4' : 'ipv6')) return null;
  const db = geoReader();
  if (!db) return null;
  let result: CityResponse | null;
  try {
    result = db.get(cleanIp);
  } catch {
    return null;
  }
  const city = result?.city?.names?.en || null;
  const country = result?.country?.iso_code || null;
  return city || country ? { city, country } : null;
}

/** ISO country code only, used for trusted-device anomaly detection. */
export function countryOfIp(ip: string | undefined | null): string | null {
  return locateIp(ip)?.country ?? null;
}
