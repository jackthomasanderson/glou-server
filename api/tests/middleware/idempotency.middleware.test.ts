import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { idempotent, resetIdempotencyStore, IdempotencyStore, IDEMPOTENCY_TTL_MS } from '../../src/middleware/idempotency.middleware';

// #824: the offline queue replays a change whose answer was lost (the server
// applied it). Without a key the replay was refused 409 and the member saw a
// false conflict; with the same key it gets the first answer back.

let applied = 0;
let answer: { status: number; body: unknown };
/** When set, the handler waits for it before answering (a request still running). */
let hold: Promise<void> | null = null;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.userId = req.header('x-test-user') ?? 'u1';
  next();
});
app.patch('/items/:id', idempotent, async (_req, res) => {
  applied += 1;
  if (hold) await hold;
  res.status(answer.status).json(answer.body);
});
app.use(errorMiddleware);

const send = (key?: string, user = 'u1', id = 'a', body: object = { isOpened: true }) => {
  const r = request(app).patch(`/items/${id}`).set('x-test-user', user).send(body);
  return key ? r.set('Idempotency-Key', key) : r;
};

beforeEach(() => {
  applied = 0;
  answer = { status: 200, body: { data: { id: 'a', updatedAt: 'v2' }, changed: [], removedIds: [] } };
  hold = null;
  resetIdempotencyStore();
});
afterEach(() => vi.useRealTimers());

describe('idempotent (#824)', () => {
  it('answers a replay with the same key with the first answer, without applying it again', async () => {
    const first = await send('k-0001-aaaa');
    answer = { status: 409, body: { error: 'CONFLICT', data: { id: 'a', updatedAt: 'v2' } } };
    const replay = await send('k-0001-aaaa');

    expect(applied).toBe(1);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replayed']).toBe('true');
  });

  it('runs every request without a key, as before', async () => {
    await send();
    await send();
    expect(applied).toBe(2);
  });

  it('keeps each member\'s keys apart', async () => {
    await send('k-0001-aaaa', 'u1');
    await send('k-0001-aaaa', 'u2');
    expect(applied).toBe(2);
  });

  it('keeps each route\'s keys apart', async () => {
    await send('k-0001-aaaa', 'u1', 'a');
    await send('k-0001-aaaa', 'u1', 'b');
    expect(applied).toBe(2);
  });

  it('never remembers a refusal: the same key is tried again (a conflict the member chose to override)', async () => {
    answer = { status: 409, body: { error: 'CONFLICT' } };
    await send('k-0001-aaaa');
    answer = { status: 200, body: { data: { id: 'a' } } };
    const again = await send('k-0001-aaaa');
    expect(applied).toBe(2);
    expect(again.status).toBe(200);
  });

  it('forgets a key after its time to live', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await send('k-0001-aaaa');
    vi.setSystemTime(Date.now() + IDEMPOTENCY_TTL_MS + 1);
    await send('k-0001-aaaa');
    expect(applied).toBe(2);
  });

  it('holds a bounded number of answers, dropping the oldest first', () => {
    const store = new IdempotencyStore(60_000, 3, 3);
    const answerOf = (n: number) => ({ status: 200, body: { n } });
    for (const n of [1, 2, 3, 4]) store.remember(`u${n}`, `k${n}`, 'h', answerOf(n));
    expect(store.size).toBe(3);
    expect(store.recall('k1')).toBeUndefined();
    expect(store.recall('k4')).toMatchObject({ answer: answerOf(4) });
  });

  it('holds a bounded number of answers per member, so one member cannot push out the others\' keys', () => {
    const store = new IdempotencyStore(60_000, 100, 2);
    store.remember('u2', 'other', 'h', { status: 200, body: {} });
    for (const n of [1, 2, 3]) store.remember('u1', `k${n}`, 'h', { status: 200, body: { n } });
    expect(store.recall('k1')).toBeUndefined();
    expect(store.recall('k3')).toBeDefined();
    expect(store.recall('other')).toBeDefined();
  });

  it('refuses the same key sent with another body (422 IDEMPOTENCY_KEY_REUSED)', async () => {
    await send('k-0001-aaaa', 'u1', 'a', { isOpened: true });
    const reused = await send('k-0001-aaaa', 'u1', 'a', { isOpened: false });
    expect(reused.status).toBe(422);
    expect(reused.body).toEqual({ error: 'IDEMPOTENCY_KEY_REUSED' });
    expect(applied).toBe(1);
  });

  it('answers a duplicate sent while the first is still running with 409 IDEMPOTENCY_IN_PROGRESS', async () => {
    let release!: () => void;
    hold = new Promise((resolve) => { release = resolve; });
    const first = send('k-0001-aaaa').then((r) => r);
    while (applied === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    const duplicate = await send('k-0001-aaaa');
    release();
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: 'IDEMPOTENCY_IN_PROGRESS' });
    expect((await first).status).toBe(200);
    expect(applied).toBe(1);
    // Once the first is answered, a replay gets its answer.
    expect((await send('k-0001-aaaa')).headers['idempotent-replayed']).toBe('true');
  });

  it('frees the key when the first request fails, so it can be sent again', async () => {
    answer = { status: 500, body: { error: 'INTERNAL' } };
    await send('k-0001-aaaa');
    answer = { status: 200, body: { data: { id: 'a' } } };
    expect((await send('k-0001-aaaa')).status).toBe(200);
    expect(applied).toBe(2);
  });

  it('refuses a malformed key', async () => {
    const res = await send('not a key!');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'INVALID_IDEMPOTENCY_KEY' });
    expect(applied).toBe(0);
  });
});
