import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn(), updateMany: vi.fn() },
    cellar: { count: vi.fn(), findFirst: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { IN_STOCK_ITEM_FILTER } from '../../src/lib/finished-item';
import { onboardingService } from '../../src/services/onboarding.service';

function instance({ cellars, own, postponedAt = null, inStock = 0 }: {
  cellars: number;
  own: { id: string; name: string } | null;
  postponedAt?: Date | null;
  /** Bottles in stock, as one group (#471). */
  inStock?: number;
}) {
  vi.mocked(prisma.cellar.count).mockResolvedValue(cellars);
  vi.mocked(prisma.cellar.findFirst).mockResolvedValue(own as never);
  vi.mocked(prisma.session.findUnique).mockResolvedValue({ onboardingPostponedAt: postponedAt } as never);
  vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(
    (inStock > 0 ? [unit({ quantity: inStock })] : []) as never,
  );
}

/** A unit row as the stock query returns it, with its family nested (#471). */
function unit(overrides: Record<string, unknown> = {}) {
  return {
    quantity: 1, isOpened: false, fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null,
    purchasePrice: null, estimatedValue: null, product: { category: 'wine' }, ...overrides,
  };
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

  it('reads the units with the shared "in stock" scope (design.md)', async () => {
    instance({ cellars: 1, own: null });
    await onboardingService.getState('u2', 's1');
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: IN_STOCK_ITEM_FILTER,
      select: expect.objectContaining({ quantity: true, cigarsPerBox: true, product: { select: { category: true } } }),
    });
  });

  // #471 (FEAT-96): a group of 6 is 6 bottles, a box of 25 is 25 cigars.
  it('counts what a joining member finds in units, not rows', async () => {
    instance({ cellars: 1, own: null });
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      unit({ quantity: 6 }),
      unit({ isOpened: true, fillLevel: 40 }),
      unit({ quantity: 1, cigarsPerBox: 25, product: { category: 'cigar' } }),
    ] as never);
    expect((await onboardingService.getState('u2', 's1')).inStockCount).toBe(32);
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
