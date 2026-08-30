import dns from 'dns';
import net from 'net';

/**
 * SSRF guard for the "fetch a user-supplied URL server-side" endpoints
 * (product image import in search.router.ts).
 *
 * The previous implementation matched the URL hostname against a regex of
 * private ranges. That misses a long tail of ways to point at internal
 * infrastructure: 0.0.0.0, IPv4-mapped and NAT64 IPv6 (`::ffff:127.0.0.1`,
 * `64:ff9b::7f00:1`), carrier-grade NAT (100.64/10), and — most importantly —
 * a public hostname whose DNS record resolves to a private address.
 *
 * This module instead resolves the hostname and checks every resulting IP
 * against the IANA special-use ranges. A narrow DNS-rebinding window remains
 * between this lookup and the connection `fetch` actually makes (`fetch` gives
 * no hook to pin the resolved address without breaking TLS SNI); that is an
 * accepted, well-understood residual risk for an authenticated-only endpoint.
 */

function ipv4ToOctets(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

function isBlockedIpv4(ip: string): boolean {
  const o = ipv4ToOctets(ip);
  if (!o) return true; // unparseable → treat as unsafe
  const [a, b, c] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255
  return false;
}

function isBlockedIpv6(raw: string): boolean {
  // `new URL()` normalises IPv6 literals to canonical compact form, so only
  // canonical forms need handling here.
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4-mapped in dotted form: ::ffff:127.0.0.1
  const dotted = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return isBlockedIpv4(dotted[1]);

  // IPv4-mapped / NAT64 in hex form: ::ffff:7f00:1 , 64:ff9b::7f00:1
  if (ip.startsWith('::ffff:') || ip.startsWith('64:ff9b:')) {
    const groups = ip.split(':').filter((g) => g.length > 0);
    const tail = groups.slice(-2);
    if (tail.length === 2 && tail.every((g) => /^[0-9a-f]{1,4}$/.test(g))) {
      const hi = parseInt(tail[0], 16);
      const lo = parseInt(tail[1], 16);
      return isBlockedIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
    }
    return true; // mapped form we couldn't parse → unsafe
  }

  if (ip === '::1' || ip === '::') return true; // loopback / unspecified
  if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(ip)) return true; // fc00::/7 unique-local
  if (ip.startsWith('ff')) return true; // ff00::/8 multicast
  if (ip.startsWith('2001:db8')) return true; // documentation
  return false;
}

/** True if `ip` (a bare address literal, not a hostname) must not be connected to. */
export function isBlockedAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP literal
}

async function resolveHostAddresses(host: string): Promise<{ address: string }[]> {
  try {
    return await dns.promises.lookup(host, { all: true });
  } catch {
    throw new Error('INVALID_URL');
  }
}

/**
 * Validate a single URL: https only, no embedded credentials, and every
 * address its host resolves to must be public. Throws `INVALID_URL` otherwise.
 */
export async function assertUrlAllowed(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('INVALID_URL');
  }

  if (parsed.protocol !== 'https:') throw new Error('INVALID_URL');
  if (parsed.username || parsed.password) throw new Error('INVALID_URL');

  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error('INVALID_URL');
    return;
  }

  const list = await resolveHostAddresses(host);
  if (list.length === 0) throw new Error('INVALID_URL');
  if (list.some((a) => isBlockedAddress(a.address))) {
    throw new Error('INVALID_URL');
  }
}

/**
 * Fetch `initialUrl`, re-validating the target before every hop (including
 * each redirect Location) so a public URL can't 3xx-bounce into the internal
 * network. Returns the first non-redirect response.
 */
export async function resolveSafeUrl(
  initialUrl: string,
  headers: Record<string, string>,
  maxRedirects = 3,
): Promise<Response> {
  let currentUrl = initialUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertUrlAllowed(currentUrl);
    const origin = new URL(currentUrl).origin;

    const response = await fetch(currentUrl, {
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
      headers: { ...headers, Referer: origin + '/' },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('FETCH_FAILED');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }
  throw new Error('TOO_MANY_REDIRECTS');
}
