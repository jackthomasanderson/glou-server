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

  it('keeps a large number of hops but warns about it', () => {
    const warn = vi.fn();
    expect(trustedProxyHops('3', warn)).toBe(3);
    expect(warn).not.toHaveBeenCalled();
    expect(trustedProxyHops('4', warn)).toBe(4);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/TRUSTED_PROXY_HOPS is above 3/);
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
    // Next's router sends an `Upgrade` request to an external rewrite the same
    // way (router-server.js upgradeHandler). The API answers it like any GET,
    // and httpxy writes that answer back to the client.
    web.on('upgrade', (req, socket, head) => {
      void proxyRequest(req, socket, parse(`http://127.0.0.1:${apiPort}${req.url}`, true), head).catch(() => undefined);
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

  // Review of #987: Node raises `upgrade`, not `request`, for these.
  const UPGRADE = { Connection: 'Upgrade', Upgrade: 'websocket' };

  it('a WebSocket upgrade request is rewritten too (0 hops)', async () => {
    uninstall = installClientAddress(0);
    expect(await forwardedFor('127.0.0.2', { ...UPGRADE, 'X-Forwarded-For': '203.0.113.66' })).toBe('127.0.0.2');
    expect(await forwardedFor('127.0.0.3', UPGRADE)).toBe('127.0.0.3');
  });

  it('a WebSocket upgrade request is rewritten too (1 hop)', async () => {
    uninstall = installClientAddress(1);
    expect(await forwardedFor('127.0.0.2', { ...UPGRADE, 'X-Forwarded-For': '203.0.113.66, 198.51.100.8' })).toBe('198.51.100.8');
    expect(await forwardedFor('127.0.0.3', UPGRADE)).toBe('127.0.0.3');
  });

  it('a second install changes nothing: the first one stays in charge', async () => {
    uninstall = installClientAddress(1);
    const second = installClientAddress(0);
    // 1 hop: the appended entry, not the socket address 0 hops would give.
    expect(await forwardedFor('127.0.0.2', { 'X-Forwarded-For': '203.0.113.66' })).toBe('203.0.113.66');
    second();
    expect(await forwardedFor('127.0.0.2', { 'X-Forwarded-For': '203.0.113.66' })).toBe('203.0.113.66');
    expect(await forwardedFor('127.0.0.2')).toBe('127.0.0.2');
  });

  it('stops rewriting once uninstalled', async () => {
    installClientAddress(0)();
    expect(await forwardedFor('127.0.0.2', { 'X-Forwarded-For': '203.0.113.66' })).toBe('203.0.113.66');
    expect(await forwardedFor('127.0.0.2', { ...UPGRADE, 'X-Forwarded-For': '203.0.113.66' })).toBe('203.0.113.66');
  });
});

/**
 * Review of #987: with an `Expect` header, Node raises `checkContinue` or
 * `checkExpectation` instead of `request` when the server listens to them.
 * Next does not today; a future version might.
 */
describe('requests with an Expect header', () => {
  let server: http.Server;
  let port = 0;
  let uninstall: (() => void) | undefined;

  beforeAll(async () => {
    const answer = (req: http.IncomingMessage, res: http.ServerResponse) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ forwardedFor: req.headers['x-forwarded-for'] ?? null }));
    };
    server = http.createServer(answer);
    server.on('checkContinue', answer);
    server.on('checkExpectation', answer);
    port = await new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function forwardedFor(expectation: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, method: 'POST', path: '/api/echo', localAddress: '127.0.0.2', agent: false, headers: { Expect: expectation, 'X-Forwarded-For': '203.0.113.66' } },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(res.statusCode === 200 ? JSON.parse(body).forwardedFor : `status ${res.statusCode}`));
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
  }

  it('rewrites the header on checkContinue (Expect: 100-continue)', async () => {
    uninstall = installClientAddress(0);
    expect(await forwardedFor('100-continue')).toBe('127.0.0.2');
  });

  it('rewrites the header on checkExpectation (any other Expect)', async () => {
    uninstall = installClientAddress(0);
    expect(await forwardedFor('something-else')).toBe('127.0.0.2');
  });
});
