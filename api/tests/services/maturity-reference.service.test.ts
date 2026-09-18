import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    maturityReference: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    inventoryItem: { count: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { maturityReferenceService } from '../../src/services/maturity-reference.service';

beforeEach(() => vi.clearAllMocks());

function ref(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    name: 'Ref',
    category: 'wine',
    mode: 'RELATIVE',
    windowFrom: 5,
    windowTo: 10,
    curveShape: 'LINEAR',
    priority: 0,
    region: null,
    color: null,
    producer: null,
    vintageFrom: null,
    vintageTo: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('maturityReferenceService.suggest — FEAT-86 cascade', () => {
  it('a higher-priority reference wins even against a more specific lower-priority one', async () => {
    vi.mocked(prisma.maturityReference.findMany).mockResolvedValue([
      ref({ id: 'general', priority: 100, curveShape: 'LINEAR', windowFrom: 3, windowTo: 6 }),
      ref({ id: 'specific', priority: 0, curveShape: 'LATE_BELL', region: 'Bordeaux', windowFrom: 8, windowTo: 20 }),
    ] as never);

    const s = await maturityReferenceService.suggest({ category: 'wine', region: 'Bordeaux', vintage: 2020 });

    expect(s?.reference.id).toBe('general');
    expect(s?.curveShape).toBe('LINEAR');
    expect(s?.peakMaturityFrom).toBe(2023);
    expect(s?.peakMaturityTo).toBe(2026);
  });

  it('at equal priority, the more specific (higher-scoring) reference wins and carries its curve', async () => {
    vi.mocked(prisma.maturityReference.findMany).mockResolvedValue([
      ref({ id: 'catch-all', priority: 10, curveShape: 'LINEAR' }),
      ref({ id: 'bordeaux', priority: 10, curveShape: 'LATE_BELL', region: 'Bordeaux' }),
    ] as never);

    const s = await maturityReferenceService.suggest({ category: 'wine', region: 'Bordeaux', vintage: 2019 });

    expect(s?.reference.id).toBe('bordeaux');
    expect(s?.curveShape).toBe('LATE_BELL');
  });

  it('returns null when no reference matches the category at all', async () => {
    vi.mocked(prisma.maturityReference.findMany).mockResolvedValue([] as never);
    expect(await maturityReferenceService.suggest({ category: 'wine' })).toBeNull();
  });
});

describe('maturityReferenceService.reorder — FEAT-86', () => {
  it('assigns descending priority in list order and skips unknown ids', async () => {
    vi.mocked(prisma.maturityReference.findMany).mockResolvedValue([
      { id: 'a' }, { id: 'b' },
    ] as never);
    // No mockImplementation needed — `$transaction` (mocked as Promise.all)
    // tolerates the `undefined` each bare `update()` returns, and we only
    // assert on the recorded call arguments.
    vi.mocked(prisma.maturityReference.update).mockResolvedValue({} as never);

    await maturityReferenceService.reorder(['b', 'ghost', 'a']);

    const calls = vi.mocked(prisma.maturityReference.update).mock.calls.map((c) => c[0]);
    // 'ghost' filtered out → 2 known ids, first gets the highest priority.
    expect(calls).toEqual([
      { where: { id: 'b' }, data: { priority: 2 } },
      { where: { id: 'a' }, data: { priority: 1 } },
    ]);
  });
});
