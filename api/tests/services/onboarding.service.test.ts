import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn(), updateMany: vi.fn() },
    cellar: { count: vi.fn(), findFirst: vi.fn() },
    inventoryItem: { count: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { IN_STOCK_ITEM_FILTER } from '../../src/lib/finished-item';
import { onboardingService } from '../../src/services/onboarding.service';

function instance({ cellars, own, postponedAt = null, inStock = 0 }: {
  cellars: number;
  own: { id: string; name: string } | null;
  postponedAt?: Date | null;
  inStock?: number;
}) {
  vi.mocked(prisma.cellar.count).mockResolvedValue(cellars);
  vi.mocked(prisma.cellar.findFirst).mockResolvedValue(own as never);
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ onboardingPostponedAt: postponedAt } as never);
  vi.mocked(prisma.inventoryItem.count).mockResolvedValue(inStock);
}

beforeEach(() => vi.clearAllMocks());

describe('onboardingService.getState — joining member (FEAT-89)', () => {
  it('is a joining member when cellars exist and none was created by them', async () => {
    instance({ cellars: 2, own: null, inStock: 240 });
    const state = await onboardingService.getState('u2', 's1');
    expect(state).toMatchObject({ joining: true, wizardCellar: null, cellarCount: 2, inStockCount: 240 });
  });

  it('is not a joining member on an empty instance', async () => {
    instance({ cellars: 0, own: null });
    expect((await onboardingService.getState('u1', 's1')).joining).toBe(false);
  });

  it('is not a joining member once they created a cellar themselves', async () => {
    instance({ cellars: 3, own: { id: 'c1', name: 'Cave' } });
    expect((await onboardingService.getState('u1', 's1')).joining).toBe(false);
  });

  it('counts items with the shared "in stock" scope (design.md)', async () => {
    instance({ cellars: 1, own: null });
    await onboardingService.getState('u2', 's1');
    expect(prisma.inventoryItem.count).toHaveBeenCalledWith({ where: IN_STOCK_ITEM_FILTER });
  });
});

describe('onboardingService.getState — resuming (FEAT-90, #685)', () => {
  it("returns the member's first cellar as the wizard's cellar", async () => {
    instance({ cellars: 2, own: { id: 'c1', name: 'Cave à vin' } });
    const state = await onboardingService.getState('u1', 's1');
    expect(state.wizardCellar).toEqual({ id: 'c1', name: 'Cave à vin' });
    expect(prisma.cellar.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'asc' },
    }));
  });
});

describe('onboarding "Later" (FEAT-90)', () => {
  it('reports the wizard as postponed for the session that chose "Later"', async () => {
    instance({ cellars: 0, own: null, postponedAt: new Date() });
    expect((await onboardingService.getState('u1', 's1')).postponed).toBe(true);
    expect(prisma.session.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }));
  });

  it('does not report it postponed for a session that did not', async () => {
    instance({ cellars: 0, own: null, postponedAt: null });
    expect((await onboardingService.getState('u1', 's2')).postponed).toBe(false);
  });

  it("postpones only the caller's own current session", async () => {
    vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 1 });
    expect(await onboardingService.postpone('u1', 's1')).toBe(true);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', userId: 'u1' },
      data: { onboardingPostponedAt: expect.any(Date) },
    });
  });

  it('postpones nothing without a session', async () => {
    expect(await onboardingService.postpone('u1', '')).toBe(false);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });
});
