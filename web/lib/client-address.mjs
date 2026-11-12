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
// the same blind spot. So the header is fixed where Node hands a parsed
// request to the server: its `request` event, and its `upgrade` event, which
// Next also proxies to a rewrite (router-server.js upgradeHandler) and which
// Node's `http.server.request.start` diagnostics channel does not cover
// (review of #987). Wrapping `emit` runs before every listener, so before
// any of Next's code, startup included.
import http from 'node:http';
import { isIP } from 'node:net';

/** One reverse proxy (Caddy, Traefik, nginx…) in front of web, the usual install. */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;
/** Above this, TRUSTED_PROXY_HOPS is kept but a warning is logged at startup. */
export const USUAL_MAX_TRUSTED_PROXY_HOPS = 3;

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
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    // Review of #987: more hops than there are proxies leaves every chain
    // short, so every visitor falls back to the address of the nearest proxy.
    if (hops > USUAL_MAX_TRUSTED_PROXY_HOPS) {
      warn(`[client-address] TRUSTED_PROXY_HOPS is above ${USUAL_MAX_TRUSTED_PROXY_HOPS}: unless that many reverse proxies really sit in front of web, every visitor will be counted on one proxy's address.`);
    }
    return hops;
  }
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
  const proto = http.Server.prototype;
  const hadOwnEmit = Object.prototype.hasOwnProperty.call(proto, 'emit');
  const emit = proto.emit;
  /**
   * @this {import('node:http').Server}
   * @param {string | symbol} event
   * @param {...any} args
   */
  proto.emit = function emitWithClientAddress(event, ...args) {
    if (event === 'request' || event === 'upgrade') {
      /** @type {import('node:http').IncomingMessage} */
      const request = args[0];
      // `request`: (req, res); `upgrade`: (req, socket, head).
      const address = clientAddress(request.headers['x-forwarded-for'], request.socket?.remoteAddress, hops);
      if (address) request.headers['x-forwarded-for'] = address;
      else delete request.headers['x-forwarded-for'];
    }
    return emit.call(this, event, ...args);
  };
  return () => {
    if (hadOwnEmit) proto.emit = emit;
    else delete (/** @type {{ emit?: unknown }} */ (proto)).emit;
  };
}
