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
  });

  it('never leaks credentials or security records', async () => {
    const json = JSON.stringify(await authService.exportUserData('u1'));
    expect(json).not.toContain('SECRET-HASH');
    expect(json).not.toContain('SECRET-2FA');
    expect(json).not.toMatch(/sessions|trustedDevices|tokenHash|passwordHash|twoFactor/);
  });
});
