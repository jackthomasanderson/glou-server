// Server-only, plain JavaScript: preloaded by `node --import` in front of
// Next's standalone server (see client-address-hook.mjs and the Dockerfile),
// never bundled.
//
// #979: Next's `rewrites()` proxy (next.config.mjs, /api and /uploads) passes
// X-Forwarded-For to the API exactly as the client sent it, and adds nothing
// when there is none. The API trusts one hop (`trust proxy 1`, the web one),
// so a client without the header was seen with web's own address — every
// member shared one per-address sign-in budget, which one stranger could
// spend — and a client with a forged header got the address it typed.
//
// Here the web layer works out the client address itself, from the socket
// and the reverse proxies the operator says are in front of it
// (TRUSTED_PROXY_HOPS), and overwrites X-Forwarded-For with that single value
// before Next sees the request: whatever the API reads, web wrote it.
//
// Why not Next's proxy.ts (middleware)? It can override request headers that
// reach a rewrite, but it never sees the socket: Next only fills in
// X-Forwarded-For from the socket when the header is absent, so a forged one
// would be indistinguishable from the real address. A route-handler proxy has
// the same blind spot. Node publishes `http.server.request.start` on this
// diagnostics channel synchronously, before the server's `request` event, so
// the header is fixed before any of Next's code runs, startup included.
import diagnosticsChannel from 'node:diagnostics_channel';
import { isIP } from 'node:net';

/** One reverse proxy (Caddy, Traefik, nginx…) in front of web, the usual install. */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Reads TRUSTED_PROXY_HOPS: how many reverse proxies in front of web may be
 * believed. Unset or blank: the default; 0: web is exposed directly. Any other
 * value keeps the default, with a warning in the logs.
 *
 * @param {string | undefined} value
 * @param {(message: string) => void} [warn]
 * @returns {number}
 */
export function trustedProxyHops(value, warn = console.warn) {
  const text = value?.trim() ?? '';
  if (text === '') return DEFAULT_TRUSTED_PROXY_HOPS;
  if (/^\d+$/.test(text)) return Number(text);
  warn(`[client-address] TRUSTED_PROXY_HOPS is not a whole number of reverse proxies (0, 1, 2…): using ${DEFAULT_TRUSTED_PROXY_HOPS}.`);
  return DEFAULT_TRUSTED_PROXY_HOPS;
}

/**
 * The client address, given the X-Forwarded-For web received, the address of
 * the socket it came from, and the number of trusted reverse proxies.
 *
 * Each trusted proxy appends the address it was reached from, so with `hops`
 * proxies the client is the `hops`-th entry from the right. With 0 hops, with
 * fewer entries than hops, or when that entry is not an IP address, the socket
 * address is used: never an address a client could have typed alone, and
 * never web's own.
 *
 * @param {string | string[] | undefined} forwardedFor
 * @param {string | undefined} socketAddress
 * @param {number} hops
 * @returns {string | undefined}
 */
export function clientAddress(forwardedFor, socketAddress, hops) {
  if (hops === 0) return socketAddress;
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '');
  const entries = header.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (entries.length < hops) return socketAddress;
  const candidate = entries[entries.length - hops];
  return isIP(candidate) ? candidate : socketAddress;
}

/**
 * Rewrites X-Forwarded-For on every request this process's HTTP servers
 * receive. Returns a function that stops it (tests).
 *
 * @param {number} hops
 * @returns {() => void}
 */
export function installClientAddress(hops) {
  /** @param {unknown} message */
  const onRequestStart = (message) => {
    const { request, socket } = /** @type {{ request: import('node:http').IncomingMessage, socket: import('node:net').Socket }} */ (message);
    const address = clientAddress(request.headers['x-forwarded-for'], socket.remoteAddress, hops);
    if (address) request.headers['x-forwarded-for'] = address;
    else delete request.headers['x-forwarded-for'];
  };
  diagnosticsChannel.subscribe('http.server.request.start', onRequestStart);
  return () => diagnosticsChannel.unsubscribe('http.server.request.start', onRequestStart);
}
