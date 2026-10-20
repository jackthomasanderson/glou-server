import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/services/notification.service', () => ({
  notificationService: { send },
}));

import { prisma } from '../../src/lib/prisma';
import { computeAlertStatus, getAlerts, recomputeAlertStatuses } from '../../src/services/alert.service';

/** Lets the fire-and-forget `void notifyPeakReached(...).catch(...)` settle before assertions run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** First `findMany` call arguments, narrowed for assertions. */
function firstFindManyArgs(): { where?: Record<string, unknown>; select?: Record<string, unknown> } {
  const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0];
  expect(call).toBeDefined();
  return (call?.[0] ?? {}) as unknown as { where?: Record<string, unknown>; select?: Record<string, unknown> };
}

const NOW = new Date('2030-06-15T12:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    name: 'Chambertin',
    producer: 'Domaine X',
    category: 'wine',
    vintage: 2020,
    peakMaturityFrom: 2028,
    peakMaturityTo: 2035,
    curveShape: null,
    alertsPaused: false,
    cellarId: null,
    collection: null,
    photoUrl: null,
    ...overrides,
  };
}

describe('computeAlertStatus', () => {
  it('derives the status from the current year', () => {
    expect(computeAlertStatus(2031, 2040)).toBe('approaching');
    expect(computeAlertStatus(2028, 2035)).toBe('peak');
    expect(computeAlertStatus(2020, 2025)).toBe('past');
    expect(computeAlertStatus(null, null)).toBe('none');
  });
});

describe('getAlerts', () => {
  // ISSUE_033: the stored `alertStatus` column is only refreshed on edit, so
  // it must never drive the alerts list — selecting on it made a bottle whose
  // window had since opened disappear from the screen forever.
  it('queries by drinking window, not by the stored alertStatus column', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getAlerts();

    const { where, select } = firstFindManyArgs();
    expect(where).toEqual({
      deletedAt: null,
      isOwned: true,
      alertsPaused: false,
      OR: [{ peakMaturityFrom: { not: null } }, { peakMaturityTo: { not: null } }],
    });
    expect(select).not.toHaveProperty('alertStatus');
  });

  it('computes the status on read, so a window that opened since the last edit is reported', async () => {
    // Saved in 2026 as 'approaching'; in 2030 the bottle is at its peak.
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([item()] as never);

    const alerts = await getAlerts();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.alertStatus).toBe('peak');
  });

  it('drops items whose window yields no alert and sorts by urgency', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      item({ id: 'approaching', peakMaturityFrom: 2040, peakMaturityTo: 2050 }),
      item({ id: 'past', peakMaturityFrom: 2010, peakMaturityTo: 2015 }),
      item({ id: 'none', peakMaturityFrom: null, peakMaturityTo: null }),
      item({ id: 'peak' }),
    ] as never);

    const alerts = await getAlerts();

    expect(alerts.map((a) => a.id)).toEqual(['past', 'peak', 'approaching']);
  });
});

describe('recomputeAlertStatuses', () => {
  it('rewrites only the rows whose stored status no longer matches the current year', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
      {
        id: 'stale',
        alertStatus: 'approaching',
        peakMaturityFrom: 2028,
        peakMaturityTo: 2035,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 'fresh',
        alertStatus: 'past',
        peakMaturityFrom: 2010,
        peakMaturityTo: 2015,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ] as never);
    vi.mocked(prisma.inventoryItem.update).mockResolvedValue({} as never);

    const result = await recomputeAlertStatuses();

    expect(result).toEqual({ scanned: 2, updated: 1 });
    expect(prisma.inventoryItem.update).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'stale' },
      // `updatedAt` is carried over untouched: this maintenance pass must not
      // look like a user edit (sort order + offline-sync conflict detection).
      data: { alertStatus: 'peak', updatedAt: new Date('2026-01-02T00:00:00.000Z') },
    });
  });

  it('only scans items that carry a drinking window', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await recomputeAlertStatuses();

    expect(firstFindManyArgs().where).toEqual({
      deletedAt: null,
      isOwned: true,
      OR: [{ peakMaturityFrom: { not: null } }, { peakMaturityTo: { not: null } }],
    });
  });

  // #338: the 'peak' notification category previously had no emitter at all.
  describe('peak-maturity notification (#338)', () => {
    it('notifies every member once an item transitions into peak', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'b1',
          name: 'Chambertin',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'approaching',
          alertsPaused: false,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ] as never);
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue({} as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'u1', language: 'FR', notifLanguage: null },
        { id: 'u2', language: 'FR', notifLanguage: 'EN' },
      ] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', category: 'peak' }));
      const enCall = send.mock.calls.find((c) => c[0].userId === 'u2')?.[0];
      expect(enCall.subject).toContain('At peak maturity');
    });

    it('does not notify when the item has alerts paused', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'b1',
          name: 'Chambertin',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'approaching',
          alertsPaused: true,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ] as never);
      vi.mocked(prisma.inventoryItem.update).mockResolvedValue({} as never);

      await recomputeAlertStatuses();
      await flush();

      expect(send).not.toHaveBeenCalled();
    });

    it('does not re-notify on a tick where the stored status is already peak', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'b1',
          name: 'Chambertin',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'peak',
          alertsPaused: false,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });
  });
});

// FEAT-87: a non-owned reference has no bottle to drink, so it must never
// reach the alert pipeline — neither the live query nor the maintenance pass.
describe('alerts exclude non-owned references (FEAT-87)', () => {
  it('getAlerts only queries owned items', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await getAlerts();

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({ deletedAt: null, isOwned: true });
  });

  it('recomputeAlertStatuses only queries owned items', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await recomputeAlertStatuses();

    const call = vi.mocked(prisma.inventoryItem.findMany).mock.calls[0][0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({ deletedAt: null, isOwned: true });
  });
});
