import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

/**
 * #824: the offline queue (web/lib/offline/syncEngine.ts) replays a change
 * whose answer was lost — the server applied it, the network dropped before
 * the answer came back. Replayed with its `expectedUpdatedAt`, it was refused
 * 409 and the member was shown a false conflict (and « Garder ma version »
 * could apply it twice). Each queued change now carries its own
 * `Idempotency-Key`; the first successful answer to a key is kept for a day
 * and given back to a replay with the same key, which changes nothing.
 *
 * Only successful answers are kept: a refusal (409 conflict, validation…)
 * runs again, so « Garder ma version » after a real conflict still applies.
 * Keys are scoped by member and route. The store is in memory: Glou runs a
 * single API process per instance (design.md), like its rate limiters; a
 * restart forgets the keys, and a replay then falls back to the version
 * check (a conflict, never a double write).
 */

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_MAX_ENTRIES = 5000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export interface StoredAnswer {
  status: number;
  body: unknown;
}

/** Answers by key, dropped after `ttlMs`, at most `maxEntries` (the oldest go first). */
export class IdempotencyStore {
  private readonly entries = new Map<string, StoredAnswer & { expiresAt: number }>();

  constructor(private readonly ttlMs: number, private readonly maxEntries: number) {}

  get size(): number {
    return this.entries.size;
  }

  recall(key: string): StoredAnswer | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return { status: entry.status, body: entry.body };
  }

  remember(key: string, answer: StoredAnswer): void {
    const now = Date.now();
    // Same time to live for all: the oldest entries expire first.
    for (const [oldKey, entry] of this.entries) {
      if (entry.expiresAt > now) break;
      this.entries.delete(oldKey);
    }
    this.entries.delete(key);
    this.entries.set(key, { ...answer, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

const store = new IdempotencyStore(IDEMPOTENCY_TTL_MS, IDEMPOTENCY_MAX_ENTRIES);

/** Tests only. */
export function resetIdempotencyStore(): void {
  store.clear();
}

/** Mount after the authentication, on a write route the offline queue replays. */
export function idempotent(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('Idempotency-Key');
  if (key === undefined) return next();
  if (!KEY_PATTERN.test(key)) throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY');

  const scoped = `${req.userId}\u0000${req.method} ${req.baseUrl}${req.path}\u0000${key}`;
  const known = store.recall(scoped);
  if (known) {
    res.setHeader('Idempotent-Replayed', 'true');
    res.status(known.status).json(known.body);
    return;
  }

  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) store.remember(scoped, { status: res.statusCode, body });
    return json(body);
  };
  next();
}
