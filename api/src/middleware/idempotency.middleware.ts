import crypto from 'crypto';
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
 * Keys are scoped by member and route, and tied to the body they came with;
 * a key is reserved while its first request runs. The store is in memory: Glou runs a
 * single API process per instance (design.md), like its rate limiters; a
 * restart forgets the keys, and a replay then falls back to the version
 * check (a conflict, never a double write).
 */

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_MAX_ENTRIES = 5000;
/** Review of #1020: one member's writes cannot push the other members' keys out. */
export const IDEMPOTENCY_MAX_ENTRIES_PER_MEMBER = 500;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export interface StoredAnswer {
  status: number;
  body: unknown;
}

/** A key: its request still running (no `answer`), or answered. */
export interface IdempotencyEntry {
  userId: string;
  /** SHA-256 of the request body: the same key with another body is refused. */
  bodyHash: string;
  answer?: StoredAnswer;
  expiresAt: number;
}

/**
 * Entries by key, dropped after `ttlMs`, at most `maxEntries` in all and
 * `maxPerMember` per member (the oldest go first).
 */
export class IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyEntry>();
  private readonly byMember = new Map<string, Set<string>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly maxPerMember: number,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  recall(key: string): IdempotencyEntry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      this.drop(key);
      return undefined;
    }
    return entry;
  }

  /** Marks the key taken while its first request runs. */
  reserve(userId: string, key: string, bodyHash: string): IdempotencyEntry {
    return this.put(key, { userId, bodyHash, expiresAt: 0 });
  }

  remember(userId: string, key: string, bodyHash: string, answer: StoredAnswer): void {
    this.put(key, { userId, bodyHash, answer, expiresAt: 0 });
  }

  /** Frees a key still reserved by `entry` (its request failed or was cut). */
  release(key: string, entry: IdempotencyEntry): void {
    if (this.entries.get(key) === entry) this.drop(key);
  }

  clear(): void {
    this.entries.clear();
    this.byMember.clear();
  }

  private put(key: string, entry: IdempotencyEntry): IdempotencyEntry {
    const now = Date.now();
    // Same time to live for all: the oldest entries expire first.
    for (const [oldKey, old] of this.entries) {
      if (old.expiresAt > now) break;
      this.drop(oldKey);
    }
    this.drop(key);
    entry.expiresAt = now + this.ttlMs;
    this.entries.set(key, entry);
    const own = this.byMember.get(entry.userId) ?? new Set<string>();
    own.add(key);
    this.byMember.set(entry.userId, own);
    while (own.size > this.maxPerMember) this.drop(own.values().next().value as string);
    while (this.entries.size > this.maxEntries) this.drop(this.entries.keys().next().value as string);
    return entry;
  }

  private drop(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    const own = this.byMember.get(entry.userId);
    own?.delete(key);
    if (own?.size === 0) this.byMember.delete(entry.userId);
  }
}

const store = new IdempotencyStore(IDEMPOTENCY_TTL_MS, IDEMPOTENCY_MAX_ENTRIES, IDEMPOTENCY_MAX_ENTRIES_PER_MEMBER);

/** Tests only. */
export function resetIdempotencyStore(): void {
  store.clear();
}

/**
 * Mount after the authentication, on a write route the offline queue replays.
 * A key already answered gives that answer back; one whose first request is
 * still running answers 409 IDEMPOTENCY_IN_PROGRESS (the queue tries again
 * later); one sent with another body answers 422 IDEMPOTENCY_KEY_REUSED.
 */
export function idempotent(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('Idempotency-Key');
  if (key === undefined) return next();
  if (!KEY_PATTERN.test(key)) throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY');

  const scoped = `${req.userId}\u0000${req.method} ${req.baseUrl}${req.path}\u0000${key}`;
  const bodyHash = crypto.createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');
  const known = store.recall(scoped);
  if (known) {
    if (known.bodyHash !== bodyHash) throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED');
    if (!known.answer) throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS');
    res.setHeader('Idempotent-Replayed', 'true');
    res.status(known.answer.status).json(known.answer.body);
    return;
  }

  const reserved = store.reserve(req.userId, scoped, bodyHash);
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) store.remember(req.userId, scoped, bodyHash, { status: res.statusCode, body });
    else store.release(scoped, reserved);
    return json(body);
  };
  // An answer that is not JSON, or a connection cut: the key is free again.
  res.on('close', () => store.release(scoped, reserved));
  next();
}
