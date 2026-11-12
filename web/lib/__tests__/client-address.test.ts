// @vitest-environment node
import http from 'node:http';
import { parse } from 'node:url';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// The function behind Next's `rewrites()` proxy (next.config.mjs sends /api
// and /uploads to the API through it): the tests below go through it, so a
// Next upgrade that changes how it forwards headers shows up here.
import { proxyRequest } from 'next/dist/server/lib/router-utils/proxy-request.js';
import { clientAddress, installClientAddress, trustedProxyHops } from '../client-address.mjs';

/**
 * #979: the API keys its per-address limits on the last X-Forwarded-For entry
 * (`trust proxy 1`, the web hop). The web layer must therefore send exactly
 * one value it trusts: the socket address, or the entry a configured reverse
 * proxy wrote — never what a client typed.
 */

describe('clientAddress', () => {
  it('uses the socket address when web is exposed directly (0 hops)', () => {
    expect(clientAddress(undefined, '198.51.100.7', 0)).toBe('198.51.100.7');
    expect(clientAddress('203.0.113.66', '198.51.100.7', 0)).toBe('198.51.100.7');
    expect(clientAddress('1.1.1.1, 203.0.113.66', '198.51.100.7', 0)).toBe('198.51.100.7');
  });

  it('takes the entry the reverse proxy appended (1 hop)', () => {
    expect(clientAddress('198.51.100.7', '172.18.0.5', 1)).toBe('198.51.100.7');
    // The client forged the first entry; the proxy appended the real one.
    expect(clientAddress('203.0.113.66, 198.51.100.7', '172.18.0.5', 1)).toBe('198.51.100.7');
    expect(clientAddress('2001:db8::1', '172.18.0.5', 1)).toBe('2001:db8::1');
  });

  it('counts hops from the right with several proxies', () => {
    expect(clientAddress('203.0.113.66, 198.51.100.7, 10.0.0.2', '172.18.0.5', 2)).toBe('198.51.100.7');
  });

  it('falls back to the socket address when the chain is shorter than the hops', () => {
    expect(clientAddress(undefined, '198.51.100.7', 1)).toBe('198.51.100.7');
    expect(clientAddress('', '198.51.100.7', 1)).toBe('198.51.100.7');
    expect(clientAddress('198.51.100.9', '198.51.100.7', 2)).toBe('198.51.100.7');
  });

  it('reads a header Node received twice as one chain', () => {
    expect(clientAddress(['203.0.113.66', '198.51.100.7'], '172.18.0.5', 1)).toBe('198.51.100.7');
  });

  it('never trusts an entry that is not an address', () => {
    expect(clientAddress('203.0.113.66, not-an-ip', '198.51.100.7', 1)).toBe('198.51.100.7');
    expect(clientAddress('198.51.100.9:4321', '198.51.100.7', 1)).toBe('198.51.100.7');
  });
});

describe('trustedProxyHops', () => {
  it('trusts one reverse proxy by default', () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops('')).toBe(1);
    expect(trustedProxyHops('  ')).toBe(1);
  });

  it('reads a whole number of hops, 0 included', () => {
    expect(trustedProxyHops('0')).toBe(0);
    expect(trustedProxyHops(' 2 ')).toBe(2);
  });

  it('keeps the default and warns on any other value', () => {
    const warn = vi.fn();
    for (const value of ['-1', '1.5', 'yes', '2abc']) {
      expect(trustedProxyHops(value, warn)).toBe(1);
    }
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls[0][0]).toMatch(/TRUSTED_PROXY_HOPS/);
  });
});

/**
 * The whole web hop, as deployed: a Node HTTP server whose requests go
 * through Next's rewrite proxy to an "API" that answers the X-Forwarded-For
 * it received. Clients connect from distinct loopback addresses (127.0.0.2,
 * 127.0.0.3), so each has its own socket address.
 */
describe('the web hop sends the API one trusted address', () => {
  let api: http.Server;
  let web: http.Server;
  let uninstall: (() => void) | undefined;

  const listen = (server: http.Server) =>
    new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

  let webPort = 0;

  beforeAll(async () => {
    api = http.createServer((req, res) => {
      // The raw header as it came over the wire: the hook, active in this
      // process, also rewrites `req.headers` on this server's requests.
      const i = req.rawHeaders.findIndex((name) => name.toLowerCase() === 'x-forwarded-for');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ forwardedFor: i === -1 ? null : req.rawHeaders[i + 1] }));
    });
    const apiPort = await listen(api);
    web = http.createServer((req, res) => {
      // What the rewrite hands it: the destination, parsed the legacy way.
      void proxyRequest(req, res, parse(`http://127.0.0.1:${apiPort}${req.url}`, true), undefined, undefined, 5000).catch(() => undefined);
    });
    webPort = await listen(web);
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  afterAll(async () => {
    await new Promise((resolve) => web.close(resolve));
    await new Promise((resolve) => api.close(resolve));
  });

  function forwardedFor(from: string, headers: Record<string, string> = {}): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: webPort, path: '/api/echo', localAddress: from, headers, agent: false },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(JSON.parse(body).forwardedFor));
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  it('without a reverse proxy (0 hops): each client is seen with its own address, a forged header is ignored', async () => {
    uninstall = installClientAddress(0);
    expect(await forwardedFor('127.0.0.2')).toBe('127.0.0.2');
    expect(await forwardedFor('127.0.0.3')).toBe('127.0.0.3');
    expect(await forwardedFor('127.0.0.2', { 'X-Forwarded-For': '203.0.113.66' })).toBe('127.0.0.2');
    expect(await forwardedFor('127.0.0.3', { 'X-Forwarded-For': '203.0.113.66, 127.0.0.2' })).toBe('127.0.0.3');
  });

  it('behind one reverse proxy (default): the address it appended is used, a request without one keeps its own', async () => {
    uninstall = installClientAddress(trustedProxyHops(undefined));
    // 127.0.0.2 plays the reverse proxy, forwarding two different clients.
    expect(await forwardedFor('127.0.0.2', { 'X-Forwarded-For': '198.51.100.7' })).toBe('198.51.100.7');
    expect(await forwardedFor('127.0.0.2', { 'X-Forwarded-For': '203.0.113.66, 198.51.100.8' })).toBe('198.51.100.8');
    // A client reaching web directly without the header is never seen with
    // web's own address (which every member would then share).
    expect(await forwardedFor('127.0.0.3')).toBe('127.0.0.3');
  });
});
