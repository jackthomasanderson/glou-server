import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// #767 (review): since every member's Gotify notification lands in the
// administrator's shared Gotify app, the "price seen" action must not let a
// member push one message per call. A price only notifies when it crosses
// the ceiling, and the action itself is limited per account. The real
// wishlist and notification services run; the database and fetch are stubs.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    wishlistItem: { findFirst: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { systemConfigService } from '../../src/services/system-config.service';

const JWT_SECRET = 'integration-test-secret';
const app = createApp();
const token = (userId: string) => jwt.sign({ userId, email: `${userId}@example.com`, scope: 'full' }, JWT_SECRET, { algorithm: 'HS256' });

const member = (id: string) => ({
  id, username: id, email: `${id}@example.com`, isActive: true, isAdmin: false, language: 'EN', notifLanguage: null,
  notifEmail: false, notifInApp: false, notifWebhook: true, notifCategories: [], notifQuietStart: null, notifQuietEnd: null,
});

/** The one wish, as stored: its last price changes with each call. */
let wish: { id: string; userId: string; name: string; producer: null; vintage: null; maxPrice: number; lastSeenPrice: number | null };

const fetchMock = vi.fn();
const spies: Array<{ mockRestore: () => void }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }] as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: { id: string } }) => member(args.where.id)) as never);
  wish = { id: 'w1', userId: 'u1', name: 'Talbot', producer: null, vintage: null, maxPrice: 100, lastSeenPrice: null };
  vi.mocked(prisma.wishlistItem.findFirst).mockImplementation((async () => ({ ...wish })) as never);
  vi.mocked(prisma.wishlistItem.update).mockImplementation((async (args: { data: { lastSeenPrice: number } }) => {
    wish = { ...wish, lastSeenPrice: args.data.lastSeenPrice };
    return { ...wish };
  }) as never);
  spies.push(vi.spyOn(systemConfigService, 'getPublic').mockResolvedValue({ smtpEnabled: false } as never));
  spies.push(vi.spyOn(systemConfigService, 'getGotify').mockResolvedValue({ gotifyEnabled: true, gotifyUrl: 'https://1.2.3.4', gotifyToken: 'APP-TOKEN' }));
});

afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  vi.unstubAllGlobals();
});

const priceSeen = (userId: string, price: number) =>
  request(app).patch('/api/wishlist/items/w1/price-seen')
    .set('Authorization', `Bearer ${token(userId)}`)
    .set('Sec-Fetch-Site', 'same-origin')
    .send({ price });

/** Lets the fire-and-forget notification finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('price seen and the shared Gotify app (#767)', () => {
  it('two prices in a row under the ceiling send one Gotify message', async () => {
    expect((await priceSeen('u1', 90)).status).toBe(200);
    expect((await priceSeen('u1', 80)).status).toBe(200);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a price that goes back above the ceiling, then under, notifies again', async () => {
    await priceSeen('u1', 90);
    await priceSeen('u1', 120);
    await priceSeen('u1', 95);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('limits the action per account', async () => {
    let last = 200;
    for (let i = 0; i < 31 && last === 200; i++) last = (await priceSeen('u2', 150)).status;

    expect(last).toBe(429);
    expect((await priceSeen('u3', 150)).status).toBe(200);
  });
});

describe('price seen, with prices stored as decimals', () => {
  it('compares 9 and 10 as numbers, not as text', async () => {
    // Prisma returns Decimal columns as objects whose value reads as a string.
    const dec = (n: number) => ({ valueOf: () => String(n), toString: () => String(n), toJSON: () => String(n) });
    wish = { ...wish, maxPrice: dec(10) as never, lastSeenPrice: dec(9) as never };

    await priceSeen('u4', 8);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
