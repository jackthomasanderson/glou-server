import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';

/**
 * Turn a raw User-Agent string into a short human-readable label,
 * e.g. "Chrome sur Windows", "Safari sur iPhone".
 */
export function describeDevice(userAgent: string | undefined | null): string {
  if (!userAgent) return 'Appareil inconnu';
  const { browser, os } = UAParser(userAgent);
  const browserName = browser.name ?? 'Navigateur inconnu';
  const osName = os.name ?? 'OS inconnu';
  return `${browserName} sur ${osName}`;
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
