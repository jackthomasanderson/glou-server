import { describe, it, expect, beforeEach, vi } from 'vitest';

// #224 — the "complete" personal export left out wishlist, budgets, goals,
// stock counts and humidor readings, and silently truncated the activity log
// to 500 rows.

vi.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findUniqueOrThrow: vi.fn() } },
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock('jsonwebtoken', () => ({ default: { sign: vi.fn() } }));
vi.mock('speakeasy', () => ({ default: { totp: { verify: vi.fn() }, generateSecret: vi.fn(), otpauthURL: vi.fn() } }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));
vi.mock('../../src/services/system-config.service', () => ({ systemConfigService: {} }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/lib/device', () => ({
  describeDevice: vi.fn(() => 'Chrome on Linux'),
  locateIp: vi.fn(() => ({ city: 'Paris', country: 'FR' })),
  countryOfIp: vi.fn(() => 'FR'),
}));

import { prisma } from '../../src/lib/prisma';
import { authService, ALL_EXPORT_CATEGORIES } from '../../src/services/auth.service';

const findUser = vi.mocked(prisma.user.findUniqueOrThrow);

function dbUser() {
  return {
    id: 'u1',
    username: 'tester',
    email: 'tester@example.com',
    displayName: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    language: 'fr',
    theme: 'system',
    passwordHash: 'SECRET-HASH',
    twoFactorSecret: 'SECRET-2FA',
    backupCodes: ['SECRET-BACKUP'],
    pinHash: 'SECRET-PIN',
    inventory: [{ id: 'i1' }],
    cellars: [{ id: 'c1' }],
    collections: [{ id: 'col1' }],
    tastingNotes: [{ id: 't1' }],
    auditLogs: [{ action: 'LOGIN', status: 'success', createdAt: new Date(), ip: '1.2.3.4', details: 'x' }],
    wishlistItems: [{ id: 'w1' }],
    budgetEnvelopes: [{ id: 'b1' }],
    consumptionGoals: [{ id: 'g1' }],
    inventoryCountSessions: [{ id: 's1', entries: [{ id: 'e1' }] }],
    humidorReadings: [{ id: 'h1' }],
    sessions: [{
      id: 'sess1', userAgent: 'UA', ip: '9.9.9.9', rememberMe: true,
      createdAt: new Date('2026-01-02T00:00:00Z'), lastActiveAt: new Date('2026-01-03T00:00:00Z'),
      expiresAt: new Date('2026-02-01T00:00:00Z'), revokedAt: null,
    }],
    trustedDevices: [{
      id: 'dev1', tokenHash: 'SECRET-TOKEN-HASH', userAgent: 'UA', ip: '9.9.9.9', country: 'FR',
      createdAt: new Date('2026-01-02T00:00:00Z'), lastUsedAt: new Date('2026-01-03T00:00:00Z'),
      expiresAt: new Date('2026-02-01T00:00:00Z'), revokedAt: null,
    }],
    configChangeLogs: [{ id: 1, fieldName: 'smtp', maskedOldVal: null, maskedNewVal: '{"host":"***"}', createdAt: new Date() }],
    notifInApp: true,
    notifEmail: false,
    notifWebhook: false,
    notifCategories: ['security'],
    notifQuietStart: null,
    notifQuietEnd: null,
    notifLanguage: null,
    webhookUrl: null,
  };
}

describe('authService.exportUserData (#224)', () => {
  beforeEach(() => {
    findUser.mockReset();
    findUser.mockResolvedValue(dbUser() as never);
  });

  it('exports every business category by default and says which ones', async () => {
    const out = await authService.exportUserData('u1');
    expect(out).toMatchObject({
      inventory: [{ id: 'i1' }],
      cellars: [{ id: 'c1' }],
      collections: [{ id: 'col1' }],
      tastingNotes: [{ id: 't1' }],
      wishlist: [{ id: 'w1' }],
      budgetEnvelopes: [{ id: 'b1' }],
      consumptionGoals: [{ id: 'g1' }],
      inventoryCounts: [{ id: 's1', entries: [{ id: 'e1' }] }],
      humidorReadings: [{ id: 'h1' }],
      sessions: [{ device: 'Chrome on Linux', rememberMe: true }],
      trustedDevices: [{ device: 'Chrome on Linux', country: 'FR' }],
      notificationPreferences: { notifInApp: true, notifCategories: ['security'] },
      configHistory: [{ fieldName: 'smtp', maskedNewVal: '{"host":"***"}' }],
    });
    expect(out.activityLog).toHaveLength(1);
    expect(out.included).toEqual(ALL_EXPORT_CATEGORIES);
  });

  it('does not cap the activity log', async () => {
    await authService.exportUserData('u1');
    const args = findUser.mock.calls[0][0] as { include: { auditLogs: Record<string, unknown> } };
    expect(args.include.auditLogs).not.toHaveProperty('take');
  });

  it('honours a category filter and reports it in `included`', async () => {
    const out = await authService.exportUserData('u1', ['wishlist', 'budget']);
    expect(out.included).toEqual(['wishlist', 'budget']);
    expect(out).toHaveProperty('wishlist');
    expect(out).not.toHaveProperty('inventory');
    expect(out).not.toHaveProperty('humidorReadings');
    expect(out).not.toHaveProperty('sessions');
    expect(out).not.toHaveProperty('trustedDevices');
  });

  it('exports session and trusted-device metadata without their secrets', async () => {
    const out = await authService.exportUserData('u1', ['sessions', 'devices']);
    expect(out.sessions).toEqual([{
      device: 'Chrome on Linux',
      location: { city: 'Paris', country: 'FR' },
      rememberMe: true,
      createdAt: new Date('2026-01-02T00:00:00Z'),
      lastActiveAt: new Date('2026-01-03T00:00:00Z'),
      expiresAt: new Date('2026-02-01T00:00:00Z'),
      revokedAt: null,
    }]);
    expect(out.trustedDevices).toEqual([{
      device: 'Chrome on Linux',
      country: 'FR',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      lastUsedAt: new Date('2026-01-03T00:00:00Z'),
      expiresAt: new Date('2026-02-01T00:00:00Z'),
      revokedAt: null,
    }]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('SECRET-TOKEN-HASH');
    expect(json).not.toContain('9.9.9.9');
  });

  it('never leaks credentials or raw session/device identifiers', async () => {
    const json = JSON.stringify(await authService.exportUserData('u1'));
    expect(json).not.toContain('SECRET-HASH');
    expect(json).not.toContain('SECRET-2FA');
    expect(json).not.toContain('SECRET-BACKUP');
    expect(json).not.toContain('SECRET-PIN');
    expect(json).not.toContain('SECRET-TOKEN-HASH');
    expect(json).not.toMatch(/tokenHash|passwordHash|twoFactorSecret|backupCodes|pinHash/);
  });
});
