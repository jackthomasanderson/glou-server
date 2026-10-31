import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    budgetEnvelope: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    inventoryItem: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  updateBudgetEnvelope,
  deleteBudgetEnvelope,
  getBudgetProgress,
} from '../../src/services/budget.service';

beforeEach(() => vi.clearAllMocks());

describe('budget envelope lookups (household-wide, ISSUE_142)', () => {
  it('updateBudgetEnvelope returns null when the envelope does not exist', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(null);
    expect(await updateBudgetEnvelope('e1', { amount: 10 })).toBeNull();
    expect(prisma.budgetEnvelope.update).not.toHaveBeenCalled();
  });

  it('deleteBudgetEnvelope returns false when the envelope is not found', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(null);
    expect(await deleteBudgetEnvelope('e1')).toBe(false);
    expect(prisma.budgetEnvelope.delete).not.toHaveBeenCalled();
  });

  it('deleteBudgetEnvelope removes an envelope regardless of who created it', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue({ id: 'e1', userId: 'someone-else' } as never);
    expect(await deleteBudgetEnvelope('e1')).toBe(true);
    expect(prisma.budgetEnvelope.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });
});

describe('getBudgetProgress', () => {
  const envelope = {
    id: 'e1',
    userId: 'u1',
    amount: 200,
    // As the web sends them (BudgetPanel): `new Date('YYYY-MM-DD')`, midnight UTC.
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-03-31'),
  };

  /** Arguments of the spending query, narrowed for assertions. */
  const spendQuery = () =>
    vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    };

  it('returns null for a missing envelope', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(null);
    expect(await getBudgetProgress('e1')).toBeNull();
  });

  it('computes spent / remaining / percent, clamping percent to 100 and remaining to 0', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ quantity: 1, purchasePrice: 250 }] as never);

    const progress = await getBudgetProgress('e1');
    expect(progress).toMatchObject({ spent: 250, remaining: 0, percent: 100 });
  });

  it('treats an empty period as zero spend', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    const progress = await getBudgetProgress('e1');
    expect(progress).toMatchObject({ spent: 0, remaining: 200, percent: 0 });
  });

  it('scopes the spending to the whole household inventory, not the envelope creator', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getBudgetProgress('e1');
    expect(spendQuery().where).not.toHaveProperty('userId');
    expect(spendQuery().where).toMatchObject({ deletedAt: null, purchasePrice: { not: null } });
  });

  // #471 (FEAT-96 c5): every copy bought is spent — a group of 6 at 20 € is
  // 120 € — drunk and written-off copies included (no stock filter at all).
  it('spends the purchase price of every copy bought, drunk and written-off ones included', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      { quantity: 6, purchasePrice: 20 },
      { quantity: 1, purchasePrice: 19.99 },
      { quantity: null, purchasePrice: 0.01 },
    ] as never);

    const progress = await getBudgetProgress('e1');

    expect(progress?.spent).toBe(140);
    const { where, select } = spendQuery();
    expect(select).toEqual({ quantity: true, purchasePrice: true });
    expect(where).not.toHaveProperty('isOpened');
    expect(where).not.toHaveProperty('writtenOffAt');
    expect(where).not.toHaveProperty('NOT');
  });

  // #471 (point 58, #578): a purchase belongs to the period of its purchase
  // day — 6 bottles bought in January and recorded in March are January's.
  it('dates a purchase by its purchase day, else by the day it was recorded', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getBudgetProgress('e1');

    expect(spendQuery().where.OR).toEqual([
      // The envelope's days, as `@db.Date` stores them (midnight UTC).
      { purchasedAt: { gte: new Date(Date.UTC(2026, 0, 1)), lte: new Date(Date.UTC(2026, 2, 31)) } },
      { purchasedAt: null, createdAt: { gte: envelope.periodStart, lte: envelope.periodEnd } },
    ]);
    expect(spendQuery().where).not.toHaveProperty('createdAt');
  });

  // West of UTC, midnight UTC on 1 October is still 30 September locally:
  // reading the bounds' local day shifted every envelope a day back.
  it('keeps the envelope\'s own days west of UTC', async () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue({
        ...envelope, periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-31'),
      } as never);
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

      await getBudgetProgress('e1');

      expect(spendQuery().where.OR).toContainEqual({
        purchasedAt: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-31T00:00:00.000Z') },
      });
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });
});

// FEAT-87: a non-owned reference was never bought, so it is not spending —
// even when a price was recorded on it.
describe('budget progress excludes non-owned references (FEAT-87)', () => {
  it('restricts the spending query to owned items', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      amount: 200,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    } as never);
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([{ quantity: 1, purchasePrice: 50 }] as never);

    const progress = await getBudgetProgress('e1');

    expect(progress?.spent).toBe(50);
    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({ isOwned: true });
  });
});
