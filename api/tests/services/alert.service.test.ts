import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

// #471: the alert status is written on the family with its mirror, in SQL
// (writeAlertStatus); the pause through writeProductFields, under the lock.
vi.mock('../../src/lib/product-fields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/product-fields')>()),
  writeProductFields: vi.fn(),
  writeAlertStatus: vi.fn(),
  lockFamily: vi.fn(),
}));

const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/services/notification.service', () => ({
  notificationService: { send },
}));
vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: { getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.test') },
}));

import { prisma } from '../../src/lib/prisma';
import { lockFamily, writeAlertStatus, writeProductFields } from '../../src/lib/product-fields';
import { computeAlertStatus, getAlerts, recomputeAlertStatuses, toggleAlertPause } from '../../src/services/alert.service';

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
      // #573: a finished bottle has been drunk — no alert left to raise.
      // `not: null` keeps an opened bottle with no recorded level in the list.
      NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
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
        productId: 'p-stale',
        alertStatus: 'approaching',
        peakMaturityFrom: 2028,
        peakMaturityTo: 2035,
        product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
      },
      {
        id: 'fresh',
        productId: 'p-fresh',
        alertStatus: 'past',
        peakMaturityFrom: 2010,
        peakMaturityTo: 2015,
        product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
      },
    ] as never);

    const result = await recomputeAlertStatuses();

    expect(result).toEqual({ scanned: 2, updated: 1 });
    expect(writeAlertStatus).toHaveBeenCalledTimes(1);
    // In SQL, no `updatedAt` moves: this maintenance pass must not look like a
    // user edit, nor carry back an `updatedAt` read before a concurrent edit.
    expect(writeAlertStatus).toHaveBeenCalledWith(prisma, 'p-stale', 'peak');
    expect(writeProductFields).not.toHaveBeenCalled();
  });

  it('only scans items that carry a drinking window', async () => {
    vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([] as never);

    await recomputeAlertStatuses();

    // #573: finished bottles are still scanned (no `NOT` clause) so the
    // status stored on their card stays current; they are only skipped when
    // notifying, which needs the fill state in the selection.
    const { where, select } = firstFindManyArgs();
    expect(where).toEqual({
      deletedAt: null,
      isOwned: true,
      OR: [{ peakMaturityFrom: { not: null } }, { peakMaturityTo: { not: null } }],
    });
    expect(select).toMatchObject({ isOpened: true, fillLevel: true });
  });

  // #338: the 'peak' notification category previously had no emitter at all.
  describe('peak-maturity notification (#338)', () => {
    it('notifies every member once an item transitions into peak', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'b1',
          productId: 'p-b1',
          name: 'Chambertin',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'approaching',
          alertsPaused: false,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
        },
      ] as never);
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

    it('escapes member-entered names in the email body (#488)', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'b1',
          productId: 'p-b1',
          name: '<a href="https://evil.example">Sign in again</a>',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'approaching',
          alertsPaused: false,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
        },
      ] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'EN', notifLanguage: null }] as never);

      await recomputeAlertStatuses();
      await flush();

      const body = send.mock.calls[0]?.[0].htmlBody as string;
      expect(body).not.toContain('<a href');
      expect(body).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    });

    it('sends each member one digest when several bottles reach peak together (#478)', async () => {
      const peaking = (id: string) => ({
        id,
        productId: `p-${id}`,
        name: `Wine ${id}`,
        producer: 'Domaine X',
        vintage: 2020,
        alertStatus: 'approaching',
        alertsPaused: false,
        peakMaturityFrom: 2028,
        peakMaturityTo: 2035,
        product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
      });
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => peaking(`b${i}`)) as never,
      );
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'u1', language: 'EN', notifLanguage: null },
        { id: 'u2', language: 'FR', notifLanguage: null },
      ] as never);

      await recomputeAlertStatuses();
      for (let i = 0; i < 20; i++) await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(2);
      const en = send.mock.calls.find((c) => c[0].userId === 'u1')?.[0];
      expect(en.subject).toBe('12 bottles reach their drinking window');
      expect(en.htmlBody).toContain('Wine b0');
      expect(en.htmlBody).not.toContain('Wine b11');
      expect(en.htmlBody).toContain('+ 2 more.');
      expect(en.htmlBody).toContain('https://glou.test/bottles?filter=alerts');
    });

    it('does not notify when the item has alerts paused', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'b1',
          productId: 'p-b1',
          name: 'Chambertin',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'approaching',
          alertsPaused: true,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
        },
      ] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(send).not.toHaveBeenCalled();
    });

    it('does not re-notify on a tick where the stored status is already peak', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'b1',
          productId: 'p-b1',
          name: 'Chambertin',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'peak',
          alertsPaused: false,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
        },
      ] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(writeAlertStatus).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    // #573: a finished bottle (opened, nothing left) has been drunk.
    it('updates the status of a finished bottle reaching peak but does not notify about it', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'drunk',
          productId: 'p-drunk',
          name: 'Chambertin',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'approaching',
          alertsPaused: false,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          isOpened: true,
          fillLevel: 0,
          product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
        },
      ] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'EN', notifLanguage: null }] as never);

      const result = await recomputeAlertStatuses();
      await flush();

      // The stored column still follows the calendar...
      expect(result).toEqual({ scanned: 1, updated: 1 });
      expect(writeAlertStatus).toHaveBeenCalledWith(prisma, 'p-drunk', 'peak');
      // ...but nobody is told to open a bottle already drunk.
      expect(send).not.toHaveBeenCalled();
    });

    it('leaves the finished bottle out of a run that also has a bottle in stock reaching peak', async () => {
      const peaking = (id: string, fill: { isOpened: boolean; fillLevel: number | null }) => ({
        id,
        productId: `p-${id}`,
        name: `Wine ${id}`,
        producer: 'Domaine X',
        vintage: 2020,
        alertStatus: 'approaching',
        alertsPaused: false,
        peakMaturityFrom: 2028,
        peakMaturityTo: 2035,
        ...fill,
        product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
      });
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        peaking('drunk', { isOpened: true, fillLevel: 0 }),
        peaking('half', { isOpened: true, fillLevel: 50 }),
      ] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'EN', notifLanguage: null }] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(writeAlertStatus).toHaveBeenCalledTimes(2);
      // A single-bottle message about the one in stock, not a two-bottle digest.
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0].subject).toBe('At peak maturity: Wine half — Domaine X (2020)');
    });

    it('still notifies for an opened bottle whose fill level was never entered', async () => {
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([
        {
          id: 'b1',
          productId: 'p-b1',
          name: 'Chambertin',
          producer: 'Domaine X',
          vintage: 2020,
          alertStatus: 'approaching',
          alertsPaused: false,
          peakMaturityFrom: 2028,
          peakMaturityTo: 2035,
          isOpened: true,
          fillLevel: null,
          product: { updatedAt: new Date('2026-01-02T00:00:00.000Z') },
        },
      ] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'EN', notifLanguage: null }] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', category: 'peak' }));
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

// #471: pausing the alerts is about the wine, so it is written on the family.
describe('toggleAlertPause', () => {
  it('flips the family\'s pause as stored once locked, mirrored onto its units', async () => {
    const tx = { product: { findUniqueOrThrow: vi.fn().mockResolvedValue({ alertsPaused: false }) } };
    vi.mocked(prisma.$transaction).mockImplementationOnce(((callback: (t: unknown) => unknown) => callback(tx)) as never);
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue({ productId: 'p1' } as never);

    expect(await toggleAlertPause('b1')).toBe(true);

    expect(lockFamily).toHaveBeenCalledWith(tx, 'p1');
    expect(vi.mocked(lockFamily).mock.invocationCallOrder[0])
      .toBeLessThan(tx.product.findUniqueOrThrow.mock.invocationCallOrder[0]);
    expect(writeProductFields).toHaveBeenCalledWith(tx, 'p1', { alertsPaused: true });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('writes nothing for an unknown item', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    expect(await toggleAlertPause('missing')).toBe(false);
    expect(writeProductFields).not.toHaveBeenCalled();
  });
});
