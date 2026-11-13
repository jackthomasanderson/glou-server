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

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.userId = req.header('x-test-user') ?? 'u1';
  next();
});
app.patch('/items/:id', idempotent, (_req, res) => {
  applied += 1;
  res.status(answer.status).json(answer.body);
});
app.use(errorMiddleware);

const send = (key?: string, user = 'u1', id = 'a') => {
  const r = request(app).patch(`/items/${id}`).set('x-test-user', user).send({ isOpened: true });
  return key ? r.set('Idempotency-Key', key) : r;
};

beforeEach(() => {
  applied = 0;
  answer = { status: 200, body: { data: { id: 'a', updatedAt: 'v2' }, changed: [], removedIds: [] } };
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
    const store = new IdempotencyStore(60_000, 3);
    const answerOf = (n: number) => ({ status: 200, body: { n } });
    for (const n of [1, 2, 3, 4]) store.remember(`k${n}`, answerOf(n));
    expect(store.size).toBe(3);
    expect(store.recall('k1')).toBeUndefined();
    expect(store.recall('k4')).toEqual(answerOf(4));
  });

  it('refuses a malformed key', async () => {
    const res = await send('not a key!');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'INVALID_IDEMPOTENCY_KEY' });
    expect(applied).toBe(0);
  });
});
