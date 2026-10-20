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
    inventoryItem: { aggregate: vi.fn() },
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
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-03-31'),
  };

  it('returns null for a missing envelope', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(null);
    expect(await getBudgetProgress('e1')).toBeNull();
  });

  it('computes spent / remaining / percent, clamping percent to 100 and remaining to 0', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.aggregate).mockResolvedValue({ _sum: { purchasePrice: 250 } } as never);

    const progress = await getBudgetProgress('e1');
    expect(progress).toMatchObject({ spent: 250, remaining: 0, percent: 100 });
  });

  it('treats a null aggregate sum as zero spend', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.aggregate).mockResolvedValue({ _sum: { purchasePrice: null } } as never);

    const progress = await getBudgetProgress('e1');
    expect(progress).toMatchObject({ spent: 0, remaining: 200, percent: 0 });
  });

  it('scopes the spend aggregate to the whole household inventory, not the envelope creator', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.aggregate).mockResolvedValue({ _sum: { purchasePrice: 10 } } as never);

    await getBudgetProgress('e1');
    const arg = vi.mocked(prisma.inventoryItem.aggregate).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(arg.where).not.toHaveProperty('userId');
    expect(arg.where).toMatchObject({
      deletedAt: null,
      createdAt: { gte: envelope.periodStart, lte: envelope.periodEnd },
    });
  });
});

// FEAT-87: a non-owned reference was never bought, so it is not spending —
// even when a price was recorded on it.
describe('budget progress excludes non-owned references (FEAT-87)', () => {
  it('restricts the spending aggregate to owned items', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      amount: 200,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
    } as never);
    vi.mocked(prisma.inventoryItem.aggregate).mockResolvedValue({ _sum: { purchasePrice: 50 } } as never);

    const progress = await getBudgetProgress('e1');

    expect(progress?.spent).toBe(50);
    const call = vi.mocked(prisma.inventoryItem.aggregate).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({ isOwned: true });
  });
});
