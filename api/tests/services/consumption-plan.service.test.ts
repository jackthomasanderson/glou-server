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
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

vi.mock('../../src/lib/product-fields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/product-fields')>()),
  writeProductFields: vi.fn(),
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
import { writeProductFields } from '../../src/lib/product-fields';
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

/** A unit as the suggestion queries read it, its family nested (#471). */
function sourceItem(overrides: Record<string, unknown> = {}) {
  const flat = {
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
  const {
    name, producer, category, vintage, photoUrl, collection, peakMaturityFrom, peakMaturityTo, curveShape,
    consumptionPostponedUntil, ...unit
  } = flat;
  return {
    // One family per unit unless a test says otherwise.
    productId: `p-${flat.id}`,
    ...unit,
    product: {
      name, producer, category, vintage, photoUrl, collection, peakMaturityFrom, peakMaturityTo, curveShape,
      consumptionPostponedUntil,
    },
  };
}

/** Routes `inventoryItem.findMany` by its `where` shape, matching the three
 * distinct queries `getSuggestions` issues in sequence. */
function mockFindManyByShape(opts: {
  alertExtra?: ReturnType<typeof sourceItem>[];
  opened?: ReturnType<typeof sourceItem>[];
  rotation?: ReturnType<typeof sourceItem>[];
  /** #471: the full lines of the wines suggested, read to preselect one (FEAT-104). */
  groups?: Record<string, unknown>[];
}) {
  vi.mocked(prisma.inventoryItem.findMany).mockImplementation(((args: unknown) => {
    const where = (args as { where?: Record<string, unknown> })?.where ?? {};
    if (where.productId && typeof where.productId === 'object' && 'in' in (where.productId as object)) {
      const families = (where.productId as { in: string[] }).in;
      return Promise.resolve((opts.groups ?? []).filter((group) => families.includes(group.productId as string)));
    }
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
      { id: 'past1', productId: 'p-past1', alertStatus: 'past', readiness: 10 },
      { id: 'peak1', productId: 'p-peak1', alertStatus: 'peak', readiness: 50 },
      { id: 'peak2', productId: 'p-peak2', alertStatus: 'peak', readiness: 90 },
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
      { id: 'postponed-alert', productId: 'p-postponed-alert', alertStatus: 'peak', readiness: 50 },
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
      { id: 'peak1', productId: 'p-peak1', alertStatus: 'peak', readiness: 50 },
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
      { id: 'p1', productId: 'p-p1', alertStatus: 'past', readiness: 0 },
      { id: 'p2', productId: 'p-p2', alertStatus: 'past', readiness: 0 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [sourceItem({ id: 'p1' }), sourceItem({ id: 'p2' })],
      opened: [],
      rotation: [sourceItem({ id: 'should-not-appear' })],
    });

    const result = await getSuggestions(2);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['p1', 'p2']);
    // Only the two Promise.all queries (alertExtra, opened) and the lines to
    // preselect from should have run — the rotation query is conditional on
    // `result.length < limit`.
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledTimes(3);
    expect(vi.mocked(prisma.inventoryItem.findMany).mock.calls.some(
      ([args]) => (args as { where: Record<string, unknown> }).where.isOpened === false
        && !('productId' in (args as { where: Record<string, unknown> }).where),
    )).toBe(false);
  });

  it('does not enumerate alert ids in the opened-items query, and excludes them in memory instead (#162)', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'peak1', productId: 'p-peak1', alertStatus: 'peak', readiness: 50 },
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
      where: {
        deletedAt: null,
        writtenOffAt: null,
        isOpened: true,
        NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
      },
      select: expect.anything(),
      // The opened bottle kept for a wine is always the same: the first opened.
      orderBy: [{ openedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(result.map((r) => ({ id: r.id, reason: r.reason }))).toEqual([
      { id: 'peak1', reason: 'peak_window' },
      { id: 'opened1', reason: 'opened' },
    ]);
  });

  it('over-fetches the rotation candidates rather than enumerating excluded ids, and filters/truncates in memory (#162)', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'peak1', productId: 'p-peak1', alertStatus: 'peak', readiness: 50 },
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

  // #573: a finished bottle (opened, nothing left) is opened too, but there is
  // nothing left to finish — "opened" must mean "opened with some left".
  it('leaves finished bottles out of the opened-items query, but keeps an opened one with no recorded level (#573)', async () => {
    vi.mocked(getAlerts).mockResolvedValue([] as never);
    mockFindManyByShape({});

    await getSuggestions();

    const openedCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls.find(
      ([args]) => (args as { where: Record<string, unknown> }).where.isOpened === true,
    );
    const openedWhere = (openedCall?.[0] as { where: Record<string, unknown> }).where;
    // `not: null` keeps the clause null-safe: without it, SQL's NOT over a
    // NULL `fillLevel` would drop an opened bottle whose level was never set.
    expect(openedWhere.NOT).toEqual({ isOpened: true, fillLevel: { equals: 0, not: null } });
  });

  // #471 (FEAT-96 c4): a wine of 9 bottles in 3 groups is one line.
  it('lists a wine once, whatever its number of groups and opened bottles', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'garage-x4', productId: 'p-cuvee', alertStatus: 'peak', readiness: 50 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [sourceItem({ id: 'garage-x4', productId: 'p-cuvee' })],
      opened: [
        // An opened bottle of the wine already listed for its peak window.
        sourceItem({ id: 'cuvee-opened', productId: 'p-cuvee', isOpened: true }),
        // Two opened bottles of another wine.
        sourceItem({ id: 'other-opened-1', productId: 'p-other', isOpened: true }),
        sourceItem({ id: 'other-opened-2', productId: 'p-other', isOpened: true }),
      ],
      rotation: [
        sourceItem({ id: 'cuvee-kitchen-x2', productId: 'p-cuvee' }),
        sourceItem({ id: 'old1', productId: 'p-old' }),
      ],
    });

    const result = await getSuggestions(10);

    expect(result.map((r) => ({ id: r.id, productId: r.productId, reason: r.reason }))).toEqual([
      // FEAT-105 c3: listed for its peak window, through its opened bottle.
      { id: 'cuvee-opened', productId: 'p-cuvee', reason: 'peak_window' },
      { id: 'other-opened-1', productId: 'p-other', reason: 'opened' },
      { id: 'old1', productId: 'p-old', reason: 'rotation' },
    ]);
    // The rotation query returns one unit per wine (its oldest), out of stock
    // and postponed wines excluded on the family.
    const rotationCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls.find(
      ([args]) => (args as { where: Record<string, unknown> }).where.isOpened === false,
    )?.[0] as unknown as { where: Record<string, unknown>; distinct: string[]; orderBy: unknown };
    expect(rotationCall.distinct).toEqual(['productId']);
    expect(rotationCall.orderBy).toEqual({ createdAt: 'asc' });
    expect(rotationCall.where).toMatchObject({
      deletedAt: null,
      writtenOffAt: null,
      product: { OR: [{ consumptionPostponedUntil: null }, { consumptionPostponedUntil: { lte: NOW } }] },
    });
  });

  // #471 (FEAT-105 c3): a wine with an opened bottle proposes to finish it first.
  it('a wine at its peak with an opened bottle is suggested through that bottle, to finish it first', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'garage-x5', productId: 'p-cuvee', alertStatus: 'peak', readiness: 50 },
    ] as never);
    mockFindManyByShape({
      alertExtra: [sourceItem({ id: 'garage-x5', productId: 'p-cuvee' })],
      opened: [
        sourceItem({ id: 'cuvee-first', productId: 'p-cuvee', isOpened: true, fillLevel: 60 }),
        sourceItem({ id: 'cuvee-second', productId: 'p-cuvee', isOpened: true, fillLevel: 90 }),
      ],
      rotation: [],
    });

    const result = await getSuggestions(10);

    expect(result.map((r) => ({ id: r.id, reason: r.reason, isOpened: r.isOpened, fillLevel: r.fillLevel }))).toEqual([
      { id: 'cuvee-first', reason: 'peak_window', isOpened: true, fillLevel: 60 },
    ]);
  });

  it('an opened box says how many cigars are left', async () => {
    vi.mocked(getAlerts).mockResolvedValue([]);
    mockFindManyByShape({ opened: [sourceItem({ id: 'box', category: 'cigar', isOpened: true, cigarsLeft: 10 })] });
    const [suggestion] = await getSuggestions(1);
    expect(suggestion).toMatchObject({ id: 'box', isOpened: true, cigarsLeft: 10, reason: 'opened' });
  });

  // #471 (FEAT-104): the plan starts on the line "J'en ouvre une" would preselect.
  it('a full wine of several lines is suggested through the line bought first, else the cheapest, else the largest', async () => {
    vi.mocked(getAlerts).mockResolvedValue([
      { id: 'kitchen', productId: 'p-cuvee', alertStatus: 'peak', readiness: 50 },
    ] as never);
    const line = (over: Record<string, unknown>) => ({
      productId: 'p-cuvee', cellarId: 'c1', purchasePrice: 20, purchasedAt: null, quantity: 1, isOpened: false,
      fillLevel: null, cigarsPerBox: null, cigarsLeft: null, writtenOffAt: null, deletedAt: null, ...over,
    });
    mockFindManyByShape({
      alertExtra: [sourceItem({ id: 'kitchen', productId: 'p-cuvee' })],
      rotation: [sourceItem({ id: 'other-a', productId: 'p-other' })],
      groups: [
        line({ id: 'kitchen', cellarId: 'c2', purchasedAt: new Date('2026-06-01'), purchasePrice: 15 }),
        line({ id: 'garage', cellarId: 'c1', purchasedAt: new Date('2026-01-10'), purchasePrice: 20 }),
        line({ id: 'other-a', productId: 'p-other', purchasePrice: 30, quantity: 2 }),
        line({ id: 'other-b', productId: 'p-other', purchasePrice: 25, quantity: 1 }),
      ],
    });

    const result = await getSuggestions(2);

    expect(result.map((r) => ({ id: r.id, cellarId: r.cellarId, productId: r.productId }))).toEqual([
      { id: 'garage', cellarId: 'c1', productId: 'p-cuvee' },
      { id: 'other-b', cellarId: 'c1', productId: 'p-other' },
    ]);
    const linesCall = vi.mocked(prisma.inventoryItem.findMany).mock.calls.find(
      ([args]) => 'productId' in (args as { where: Record<string, unknown> }).where,
    )?.[0] as unknown as { where: Record<string, unknown> };
    expect(linesCall.where).toMatchObject({ deletedAt: null, writtenOffAt: null, isOpened: false, productId: { in: ['p-cuvee', 'p-other'] } });
  });

  it('propagates a failure from the underlying alert lookup rather than swallowing it (error case)', async () => {
    vi.mocked(getAlerts).mockRejectedValue(new Error('DB_UNAVAILABLE'));

    await expect(getSuggestions(5)).rejects.toThrow('DB_UNAVAILABLE');
  });
});

describe('postponeItem', () => {
  it('sets consumptionPostponedUntil `days` from now and returns true (nominal)', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ id: 'b1', productId: 'p1' } as never);

    const ok = await postponeItem('b1', 7);

    expect(ok).toBe(true);
    // #471: the family is postponed (and mirrored onto its units).
    expect(writeProductFields).toHaveBeenCalledWith({}, 'p1', {
      consumptionPostponedUntil: new Date('2030-06-22T12:00:00.000Z'),
    });
  });

  it('returns false and writes nothing for an unknown or already-deleted item (error case)', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    const ok = await postponeItem('missing');

    expect(ok).toBe(false);
    expect(writeProductFields).not.toHaveBeenCalled();
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
        finishedBy: 'u1',
        finishedAt: { gte: goal.periodStart, lte: goal.periodEnd },
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

// FEAT-87: a non-owned reference is never something to drink, so neither
// the "finish what's started" query nor the rotation filler may return one.
describe('consumption suggestions (FEAT-87, #471)', () => {
  it('needs no ownership filter: a reference has no bottle (#471)', async () => {
    vi.mocked(getAlerts).mockResolvedValue([] as never);
    mockFindManyByShape({});

    await getSuggestions();

    const wheres = vi
      .mocked(prisma.inventoryItem.findMany)
      .mock.calls.map((c) => (c[0] as unknown as { where: Record<string, unknown> }).where);
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) {
      expect(where).not.toHaveProperty('isOwned');
    }
  });

  it('counts the finished bottles towards a personal consumption goal', async () => {
    vi.mocked(prisma.consumptionGoal.findFirst).mockResolvedValue({
      id: 'g1',
      userId: 'u1',
      targetValue: 10,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-12-31'),
    } as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(2 as never);

    await getGoalProgress('u1');

    const call = vi.mocked(prisma.inventoryItem.count).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({ isOpened: true, fillLevel: 0 });
  });

  // #589: whoever last edited a finished bottle (a move, a tag, a count) is
  // not who drank it, and its last edit is not when.
  it('counts the bottles the member finished in the period, never those they only edited', async () => {
    vi.mocked(prisma.consumptionGoal.findFirst).mockResolvedValue({
      id: 'g1', userId: 'u1', targetValue: 4, periodStart: new Date('2026-03-01'), periodEnd: new Date('2026-03-31'),
    } as never);
    vi.mocked(prisma.inventoryItem.count).mockResolvedValue(1 as never);

    await getGoalProgress('u1');

    const { where } = vi.mocked(prisma.inventoryItem.count).mock.calls[0][0] as unknown as { where: Record<string, unknown> };
    expect(where).toMatchObject({ finishedBy: 'u1', finishedAt: { gte: new Date('2026-03-01'), lte: new Date('2026-03-31') } });
    expect(where).not.toHaveProperty('updatedBy');
    expect(where).not.toHaveProperty('updatedAt');
  });
});
