import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    consumptionGoal: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Only `getAlerts` is stubbed — it owns its own prisma query, already
// covered by alert.service.test.ts. `computeAlertStatus`/`computeReadiness`
// are kept real: they're pure functions, and the ordering under test here
// depends on their actual output.
vi.mock('../../src/services/alert.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/alert.service')>();
  return { ...actual, getAlerts: vi.fn() };
});

import { prisma } from '../../src/lib/prisma';
import { getAlerts } from '../../src/services/alert.service';
import {
  getSuggestions,
  postponeItem,
  getCurrentGoal,
  setGoal,
  getGoalProgress,
} from '../../src/services/consumption-plan.service';

const NOW = new Date('2030-06-15T12:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function sourceItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    name: 'Chambertin',
    producer: 'Domaine X',
    category: 'wine',
    vintage: 2018,
    photoUrl: null,
    cellarId: 'c1',
    collection: null,
    isOpened: false,
    fillLevel: null,
    peakMaturityFrom: 2028,
    peakMaturityTo: 2032,
    curveShape: null,
    consumptionPostponedUntil: null,
    createdAt: new Date('2029-01-01'),
    ...overrides,
  };
}

/** Routes `inventoryItem.findMany` by its `where` shape, matching the three
 * distinct queries `getSuggestions` issues in sequence. */
function mockFindManyByShape(opts: {
  alertExtra?: ReturnType<typeof sourceItem>[];
  opened?: ReturnType<typeof sourceItem>[];
  rotation?: ReturnType<typeof sourceItem>[];
}) {
  vi.mocked(prisma.inventoryItem.findMany).mockImplementation(((args: unknown) => {
    const where = (args as { where?: Record<string, unknown> })?.where ?? {};
    if (where.id && typeof where.id === 'object' && 'in' in (where.id as object)) {
      return Promise.resolve(opts.alertExtra ?? []);
    }
    if (where.isOpened === true) {
      return Promise.resolve(opts.opened ?? []);
    }
    if (where.isOpened === false) {
      return Promise.resolve(opts.rotation ?? []);
    }
    return Promise.resolve([]);
  }) as never);
}

describe('getSuggestions', () => {
  it('orders peak-window items by urgency weight, then by readiness within the same weight (nominal)', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'past1', alertStatus: 'past', readiness: 10 },
      { id: 'peak1', alertStatus: 'peak', readiness: 50 },
      { id: 'peak2', alertStatus: 'peak', readiness: 90 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [
        sourceItem({ id: 'past1', name: 'Past wine' }),
        sourceItem({ id: 'peak1', name: 'Peak low readiness' }),
        sourceItem({ id: 'peak2', name: 'Peak high readiness' }),
      ],
      opened: [],
      rotation: [],
    });

    const result = await getSuggestions(10);

    // past (weight 0) first, then the two 'peak' items (weight 1) with the
    // higher-readiness one surfaced first as the tie-break.
    expect(result.map((r) => r.id)).toEqual(['past1', 'peak2', 'peak1']);
    expect(result.every((r) => r.reason === 'peak_window')).toBe(true);
  });

  it('excludes items whose consumptionPostponedUntil is still in the future, from both the alert and opened sources', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'postponed-alert', alertStatus: 'peak', readiness: 50 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [
        sourceItem({ id: 'postponed-alert', consumptionPostponedUntil: new Date('2030-07-01') }),
      ],
      opened: [
        sourceItem({ id: 'postponed-opened', isOpened: true, consumptionPostponedUntil: new Date('2030-07-01') }),
        sourceItem({ id: 'opened-ok', isOpened: true, consumptionPostponedUntil: null }),
      ],
      rotation: [],
    });

    const result = await getSuggestions(10);

    expect(result.map((r) => r.id)).toEqual(['opened-ok']);
  });

  it('adds opened items not already surfaced by the alert source, ranked below any peak/past item', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'peak1', alertStatus: 'peak', readiness: 50 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [sourceItem({ id: 'peak1' })],
      opened: [sourceItem({ id: 'opened1', isOpened: true })],
      rotation: [],
    });

    const result = await getSuggestions(10);

    expect(result.map((r) => ({ id: r.id, reason: r.reason }))).toEqual([
      { id: 'peak1', reason: 'peak_window' },
      { id: 'opened1', reason: 'opened' },
    ]);
  });

  it('fills remaining slots with the oldest untouched stock once alert/opened sources are exhausted', async () => {
    vi.mocked(getAlerts).mockResolvedValue([]);
    mockFindManyByShape({
      alertExtra: [],
      opened: [],
      rotation: [sourceItem({ id: 'old1' }), sourceItem({ id: 'old2' })],
    });

    const result = await getSuggestions(5);

    expect(result.map((r) => ({ id: r.id, reason: r.reason }))).toEqual([
      { id: 'old1', reason: 'rotation' },
      { id: 'old2', reason: 'rotation' },
    ]);
  });

  it('never returns more than `limit` items, and skips the rotation query once the limit is already reached', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'p1', alertStatus: 'past', readiness: 0 },
      { id: 'p2', alertStatus: 'past', readiness: 0 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [sourceItem({ id: 'p1' }), sourceItem({ id: 'p2' })],
      opened: [],
      rotation: [sourceItem({ id: 'should-not-appear' })],
    });

    const result = await getSuggestions(2);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['p1', 'p2']);
    // Only the two Promise.all queries (alertExtra, opened) should have run —
    // the rotation query is conditional on `result.length < limit`.
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not enumerate alert ids in the opened-items query, and excludes them in memory instead (#162)', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'peak1', alertStatus: 'peak', readiness: 50 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [sourceItem({ id: 'peak1' })],
      // Same row surfaces from both the alert source and the (unfiltered)
      // opened-items query — it must only appear once, as 'peak_window'.
      opened: [sourceItem({ id: 'peak1', isOpened: true }), sourceItem({ id: 'opened1', isOpened: true })],
      rotation: [],
    });

    const result = await getSuggestions(10);

    const openedCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls.find(
      ([args]) => (args as { where: Record<string, unknown> }).where.isOpened === true,
    );
    expect(openedCall?.[0]).toEqual({
      where: { deletedAt: null, isOpened: true },
      select: expect.anything(),
    });
    expect(result.map((r) => ({ id: r.id, reason: r.reason }))).toEqual([
      { id: 'peak1', reason: 'peak_window' },
      { id: 'opened1', reason: 'opened' },
    ]);
  });

  it('over-fetches the rotation candidates rather than enumerating excluded ids, and filters/truncates in memory (#162)', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'peak1', alertStatus: 'peak', readiness: 50 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [sourceItem({ id: 'peak1' })],
      opened: [sourceItem({ id: 'opened1', isOpened: true })],
      // The rotation query itself is never filtered by id — it can return
      // rows already surfaced elsewhere, which getSuggestions must drop.
      rotation: [
        sourceItem({ id: 'peak1' }),
        sourceItem({ id: 'opened1' }),
        sourceItem({ id: 'old1' }),
        sourceItem({ id: 'old2' }),
      ],
    });

    const result = await getSuggestions(3);

    const rotationCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls.find(
      ([args]) => (args as { where: Record<string, unknown> }).where.isOpened === false,
    );
    const rotationWhere = (rotationCall?.[0] as { where: Record<string, unknown> }).where;
    expect(rotationWhere.id).toBeUndefined();
    expect((rotationCall?.[0] as { take: number }).take).toBe(1 + 2); // needed(1) + excludeIds.size(2)
    expect(result.map((r) => r.id)).toEqual(['peak1', 'opened1', 'old1']);
  });

  it('propagates a failure from the underlying alert lookup rather than swallowing it (error case)', async () => {
    vi.mocked(getAlerts).mockRejectedValue(new Error('DB_UNAVAILABLE'));

    await expect(getSuggestions(5)).rejects.toThrow('DB_UNAVAILABLE');
  });
});

describe('postponeItem', () => {
  it('sets consumptionPostponedUntil `days` from now and returns true (nominal)', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'b1' } as never);
    vi.mocked(prisma.inventoryItem.update).mockResolvedValue({} as never);

    const ok = await postponeItem('b1', 7);

    expect(ok).toBe(true);
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: expect.objectContaining({
        consumptionPostponedUntil: new Date('2030-06-22T12:00:00.000Z'),
      }),
    });
  });

  it('returns false and writes nothing for an unknown or already-deleted item (error case)', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    const ok = await postponeItem('missing');

    expect(ok).toBe(false);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });
});

describe('consumption goals', () => {
  it('getCurrentGoal resolves the goal covering "now" for this user (nominal)', async () => {
    const goal = { id: 'g1', periodStart: new Date('2030-06-01'), periodEnd: new Date('2030-06-30') };
    vi.mocked(prisma.consumptionGoal.findFirst).mockResolvedValue(goal as never);

    const result = await getCurrentGoal('u1');

    expect(result).toEqual(goal);
    expect(prisma.consumptionGoal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', periodStart: { lte: NOW }, periodEnd: { gte: NOW } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('setGoal creates a new row scoped to the user (nominal)', async () => {
    const input = { periodStart: new Date('2030-06-01'), periodEnd: new Date('2030-06-30'), targetType: 'count', targetValue: 10 };
    vi.mocked(prisma.consumptionGoal.create).mockResolvedValue({ id: 'g2', ...input } as never);

    await setGoal('u1', input as never);

    expect(prisma.consumptionGoal.create).toHaveBeenCalledWith({
      data: { userId: 'u1', ...input },
    });
  });

  it('getGoalProgress returns a zeroed result when no goal covers the current period (error/edge case)', async () => {
    vi.mocked(prisma.consumptionGoal.findFirst).mockResolvedValue(null);

    const progress = await getGoalProgress('u1');

    expect(progress).toEqual({ goal: null, consumedCount: 0, percent: 0, remaining: 0 });
    expect(prisma.inventoryItem.count).not.toHaveBeenCalled();
  });

  it('getGoalProgress computes percent/remaining and clamps percent at 100 when the goal is exceeded', async () => {
    const goal = { id: 'g1', periodStart: new Date('2030-06-01'), periodEnd: new Date('2030-06-30'), targetType: 'count', targetValue: 5 };
    vi.mocked(prisma.consumptionGoal.findFirst).mockResolvedValue(goal as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(8);

    const progress = await getGoalProgress('u1');

    expect(progress).toEqual({ goal, consumedCount: 8, percent: 100, remaining: 0 });
    expect(prisma.inventoryItem.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        isOpened: true,
        fillLevel: 0,
        updatedBy: 'u1',
        updatedAt: { gte: goal.periodStart, lte: goal.periodEnd },
      },
    });
  });

  it('getGoalProgress never divides by zero when targetValue is 0 (edge case)', async () => {
    const goal = { id: 'g1', periodStart: new Date('2030-06-01'), periodEnd: new Date('2030-06-30'), targetType: 'count', targetValue: 0 };
    vi.mocked(prisma.consumptionGoal.findFirst).mockResolvedValue(goal as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(3);

    const progress = await getGoalProgress('u1');

    expect(progress.percent).toBe(0);
    expect(progress.remaining).toBe(0);
  });
});
