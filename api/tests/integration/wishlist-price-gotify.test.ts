import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// #767 (review): every member's Gotify notification lands in the
// administrator's shared Gotify app. #468: a price the member typed in
// themselves sends no message at all, and the action stays limited per
// account. The real wishlist and notification services run; the database
// and fetch are stubs.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn() },
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
const token = (userId: string) => jwt.sign({ userId, email: `${userId}@example.com`, scope: 'full', sessionId: 's1' }, JWT_SECRET, { algorithm: 'HS256' });

const member = (id: string) => ({
  id, username: id, email: `${id}@example.com`, isActive: true, isAdmin: false, language: 'EN', notifLanguage: null,
  notifEmail: false, notifWebhook: true, notifCategories: [], notifQuietStart: null, notifQuietEnd: null,
});

/** The one wish, as stored: its last price changes with each call. */
let wish: { id: string; userId: string; name: string; producer: null; vintage: null; maxPrice: number; lastSeenPrice: number | null };

const fetchMock = vi.fn();
const spies: Array<{ mockRestore: () => void }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  // #608: every token carries a live session.
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
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
  it('a price at or below the ceiling sends no message (#468)', async () => {
    expect((await priceSeen('u1', 90)).status).toBe(200);
    expect((await priceSeen('u1', 120)).status).toBe(200);
    expect((await priceSeen('u1', 100)).status).toBe(200);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wish.lastSeenPrice).toBe(100);
  });

  it('limits the action per account', async () => {
    let last = 200;
    for (let i = 0; i < 31 && last === 200; i++) last = (await priceSeen('u2', 150)).status;

    expect(last).toBe(429);
    expect((await priceSeen('u3', 150)).status).toBe(200);
  });
});
