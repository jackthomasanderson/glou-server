import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// FEAT-115 (#990): the What's New? window's routes. Administrators only, the
// seen state is each administrator's own, closing the window marks what is
// installed as seen, and a member made administrator starts with it seen.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
    session: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  connectWithRetry: vi.fn(),
}));

vi.mock('../../src/lib/app-version', () => ({ APP_VERSION: '2026.12' }));

// A fixed catalog, built with the real parser: upcoming notes (a beta image),
// the installed 2026.12, an older 2026.11, and 2026.12.1 not installed yet.
vi.mock('../../src/lib/release-notes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/release-notes')>();
  const en = '## Upcoming\n### New\n- Soon.\n## v2026.12.1\n### Fixed\n- Later fix.\n## v2026.12\n### Points of attention\n- Sign in again.\n### New\n- Window.\n## v2026.11\n### Fixed\n- Old fix.\n';
  const fr = '## À venir\n### Nouveautés\n- Bientôt.\n## v2026.12.1\n### Corrections\n- Correction future.\n## v2026.12\n### Points d\'attention\n- Reconnectez-vous.\n### Nouveautés\n- Fenêtre.\n## v2026.11\n### Corrections\n- Vieille correction.\n';
  return { ...actual, RELEASE_NOTES: actual.buildCatalog(actual.parseReleaseNotes(en, 'en'), actual.parseReleaseNotes(fr, 'fr')) };
});

import { prisma } from '../../src/lib/prisma';
import { createApp } from '../../src/app';
import { noteId } from '../../src/lib/release-notes';

const JWT_SECRET = 'integration-test-secret';
const PASSWORD = 'admin-pw';
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

const app = createApp();
const tokenFor = (userId: string) => jwt.sign({ userId, email: `${userId}@example.com`, scope: 'full', sessionId: `s-${userId}` }, JWT_SECRET, { algorithm: 'HS256' });

type Account = { id: string; isActive: boolean; isAdmin: boolean; lastSeenReleaseVersion: string | null; seenReleaseNoteIds: string[] };
let accounts: Record<string, Account>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  accounts = {
    a1: { id: 'a1', isActive: true, isAdmin: true, lastSeenReleaseVersion: null, seenReleaseNoteIds: [] },
    a2: { id: 'a2', isActive: true, isAdmin: true, lastSeenReleaseVersion: '2026.12', seenReleaseNoteIds: [noteId('Soon.')] },
    m1: { id: 'm1', isActive: true, isAdmin: false, lastSeenReleaseVersion: null, seenReleaseNoteIds: [] },
  };
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) } as never);
  vi.mocked(prisma.session.update).mockResolvedValue({} as never);
  vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: { where: { id: string } }) => accounts[where.id] ?? null) as never);
  vi.mocked(prisma.user.findUniqueOrThrow).mockImplementation((async () => ({
    id: 'a1', passwordHash, isTwoFactorEnabled: false, twoFactorSecret: null, backupCodes: [],
  })) as never);
  vi.mocked(prisma.user.update).mockImplementation((async ({ where, data }: { where: { id: string }; data: Partial<Account> }) => {
    accounts[where.id] = { ...accounts[where.id], ...data };
    return accounts[where.id];
  }) as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.user.count).mockResolvedValue(1);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)) as never);
});

const as = (userId: string, method: 'get' | 'post', path: string, body: Record<string, unknown> = {}) => {
  const req = request(app)[method](path).set('Authorization', `Bearer ${tokenFor(userId)}`).set('Sec-Fetch-Site', 'same-origin');
  return method === 'post' ? req.send(body) : req;
};

type View = { currentVersion: string; releases: Array<{ version: string | null; notes: Array<{ id: string; section: string; text: { en: string; fr: string }; seen: boolean }> }> };
const unseenTexts = (view: View) => view.releases.flatMap((r) => r.notes.filter((n) => !n.seen).map((n) => n.text.en));

describe('GET /api/admin/release-notes (#990)', () => {
  it('refuses a member', async () => {
    const res = await as('m1', 'get', '/api/admin/release-notes');
    expect(res.status).toBe(403);
  });

  it('gives an administrator the installed version and every release up to it, upcoming first, in both languages', async () => {
    const res = await as('a1', 'get', '/api/admin/release-notes');

    expect(res.status).toBe(200);
    const view = res.body.data as View;
    expect(view.currentVersion).toBe('2026.12');
    expect(view.releases.map((r) => r.version)).toEqual([null, '2026.12', '2026.11']);
    expect(view.releases[1].notes[0]).toEqual({ id: noteId('Sign in again.'), section: 'attention', text: { en: 'Sign in again.', fr: 'Reconnectez-vous.' }, seen: false });
    // An administrator who never closed the window has seen nothing.
    expect(unseenTexts(view)).toEqual(['Soon.', 'Sign in again.', 'Window.', 'Old fix.']);
  });

  it('marks as seen what this administrator has already seen, not what another one has', async () => {
    const a2 = (await as('a2', 'get', '/api/admin/release-notes')).body.data as View;
    const a1 = (await as('a1', 'get', '/api/admin/release-notes')).body.data as View;

    expect(unseenTexts(a2)).toEqual([]);
    expect(unseenTexts(a1)).toHaveLength(4);
  });

  it('shows a new upcoming note alone to an administrator who saw the earlier ones (beta)', async () => {
    accounts.a2.seenReleaseNoteIds = [noteId('An upcoming note that was edited since.')];
    const view = (await as('a2', 'get', '/api/admin/release-notes')).body.data as View;
    expect(unseenTexts(view)).toEqual(['Soon.']);
  });
});

describe('POST /api/admin/release-notes/seen (#990)', () => {
  it('refuses a member', async () => {
    const res = await as('m1', 'post', '/api/admin/release-notes/seen');
    expect(res.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('marks the installed version and the upcoming notes as seen for this administrator only', async () => {
    const res = await as('a1', 'post', '/api/admin/release-notes/seen');

    expect(res.status).toBe(204);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'a1' },
      data: { lastSeenReleaseVersion: '2026.12', seenReleaseNoteIds: [noteId('Soon.')] },
    }));
    // Whatever the device: the state is on the account, so the next read has nothing unseen.
    const view = (await as('a1', 'get', '/api/admin/release-notes')).body.data as View;
    expect(unseenTexts(view)).toEqual([]);
  });
});

describe('POST /api/admin/users/:userId/role (#990)', () => {
  it('starts a new administrator with everything installed seen, so the whole history does not pop up', async () => {
    const res = await as('a1', 'post', '/api/admin/users/m1/role', { isAdmin: true, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(accounts.m1).toMatchObject({ isAdmin: true, lastSeenReleaseVersion: '2026.12', seenReleaseNoteIds: [noteId('Soon.')] });
  });

  it('leaves the seen state alone when the role is removed', async () => {
    const res = await as('a1', 'post', '/api/admin/users/a2/role', { isAdmin: false, password: PASSWORD });

    expect(res.status).toBe(200);
    const data = vi.mocked(prisma.user.update).mock.calls.at(-1)?.[0] as { data: Record<string, unknown> };
    expect(data.data).toEqual({ isAdmin: false });
  });
});
