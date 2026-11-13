import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * #979: the web container overwrites X-Forwarded-For with the one client
 * address it trusts before relaying /api to the API. This stack runs with the
 * default TRUSTED_PROXY_HOPS=1 (one reverse proxy in front of web), so each
 * request here plays a reverse proxy forwarding a client: the address it
 * appended is the one the per-address sign-in budget is counted on.
 *
 * Through the real web image (the hook is preloaded by its Dockerfile) and
 * the real API. The documentation test-net addresses below are random per
 * run, so a retry or a local re-run starts from fresh budgets; the sign-in
 * budget of requests without the header (the rest of the suite) is never
 * spent here. The "web reached directly" deployment (0 hops) is covered with
 * distinct socket addresses in web/lib/__tests__/client-address.test.ts.
 */

const octet = () => 1 + Math.floor(Math.random() * 250);

/** A refused sign-in (invalid body): the per-address limiter counts it all the same. */
async function signIn(api: APIRequestContext, forwardedFor: string): Promise<number> {
  const res = await api.post('/api/auth/login', { data: {}, headers: { 'X-Forwarded-For': forwardedFor } });
  return res.status();
}

test('one client spending the per-address sign-in budget does not block another one', async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  const spent = `198.51.100.${octet()}`;
  const other = `203.0.113.${octet()}`;
  try {
    let status = 0;
    // 20 attempts per address per window (app.ts authLimiter), then 429.
    for (let i = 0; i < 25 && status !== 429; i++) status = await signIn(api, spent);
    expect(status, 'the spent address is refused').toBe(429);

    // Another client is not blocked.
    expect(await signIn(api, other)).not.toBe(429);
    // The address the proxy appended (the last one) is what counts: a client
    // writing another address in front of it gains nothing…
    expect(await signIn(api, `${other}, ${spent}`)).toBe(429);
    // …and cannot borrow the spent address to block someone else either.
    expect(await signIn(api, `${spent}, ${other}`)).not.toBe(429);
  } finally {
    await api.dispose();
  }
});

/** `RateLimit-Remaining` of the API's per-address limiter (app.ts apiLimiter) for one request. */
async function remaining(api: APIRequestContext, headers: Record<string, string> = {}): Promise<number> {
  const res = await api.get('/api/version', { headers });
  expect(res.ok(), `${res.status()} ${await res.text()}`).toBe(true);
  const value = Number(res.headers()['ratelimit-remaining']);
  expect(Number.isInteger(value), 'RateLimit-Remaining header').toBe(true);
  return value;
}

/**
 * Proves the web image really runs the hook. Without it, Express alone
 * already takes the last X-Forwarded-For entry, so the test above holds on
 * an image that lost `--import` too. Two requests the hook alone counts on
 * the same address — this runner's own connection to web:
 * - one without the header: without the hook, the API sees web's container
 *   address (the one every member used to share);
 * - one whose last entry is not an address: without the hook, the API counts
 *   it on that text.
 * With the hook both draw from one budget, so the second leaves exactly one
 * request fewer. Without it they are two unrelated budgets: web's address has
 * already served the whole suite, the text one is new.
 */
test('web counts a request without the header on the visitor\'s own connection, not on web\'s address', async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const own = await remaining(api);
    expect(await remaining(api, { 'X-Forwarded-For': `198.51.100.${octet()}, not-an-address` })).toBe(own - 1);
    // A proxy-appended address has a budget of its own.
    expect(await remaining(api, { 'X-Forwarded-For': `192.0.2.${octet()}` })).toBeGreaterThan(own);
  } finally {
    await api.dispose();
  }
});
