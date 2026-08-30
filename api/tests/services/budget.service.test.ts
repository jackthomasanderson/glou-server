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

describe('budget envelope ownership guards', () => {
  it('updateBudgetEnvelope returns null when the envelope is not the caller’s', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(null);
    expect(await updateBudgetEnvelope('u1', 'e1', { amount: 10 })).toBeNull();
    expect(prisma.budgetEnvelope.update).not.toHaveBeenCalled();
  });

  it('deleteBudgetEnvelope returns false when the envelope is not found', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(null);
    expect(await deleteBudgetEnvelope('u1', 'e1')).toBe(false);
    expect(prisma.budgetEnvelope.delete).not.toHaveBeenCalled();
  });

  it('deleteBudgetEnvelope removes an owned envelope', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue({ id: 'e1', userId: 'u1' } as never);
    expect(await deleteBudgetEnvelope('u1', 'e1')).toBe(true);
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

  it('returns null for a missing / unowned envelope', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(null);
    expect(await getBudgetProgress('u1', 'e1')).toBeNull();
  });

  it('computes spent / remaining / percent, clamping percent to 100 and remaining to 0', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.aggregate).mockResolvedValue({ _sum: { purchasePrice: 250 } } as never);

    const progress = await getBudgetProgress('u1', 'e1');
    expect(progress).toMatchObject({ spent: 250, remaining: 0, percent: 100 });
  });

  it('treats a null aggregate sum as zero spend', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.aggregate).mockResolvedValue({ _sum: { purchasePrice: null } } as never);

    const progress = await getBudgetProgress('u1', 'e1');
    expect(progress).toMatchObject({ spent: 0, remaining: 200, percent: 0 });
  });

  it('scopes the spend aggregate to the caller and the envelope window', async () => {
    vi.mocked(prisma.budgetEnvelope.findFirst).mockResolvedValue(envelope as never);
    vi.mocked(prisma.inventoryItem.aggregate).mockResolvedValue({ _sum: { purchasePrice: 10 } } as never);

    await getBudgetProgress('u1', 'e1');
    const arg = vi.mocked(prisma.inventoryItem.aggregate).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(arg.where).toMatchObject({
      userId: 'u1',
      deletedAt: null,
      createdAt: { gte: envelope.periodStart, lte: envelope.periodEnd },
    });
  });
});
