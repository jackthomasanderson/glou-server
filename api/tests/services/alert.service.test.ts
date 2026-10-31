import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    product: { findMany: vi.fn() },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

// #471: the alert status is written on the family (writeProductFields mirrors it).
vi.mock('../../src/lib/product-fields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/product-fields')>()),
  writeProductFields: vi.fn(),
}));

const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/services/notification.service', () => ({
  notificationService: { send },
}));
vi.mock('../../src/services/system-config.service', () => ({
  systemConfigService: { getEffectivePublicUrl: vi.fn().mockResolvedValue('https://glou.test') },
}));

import { prisma } from '../../src/lib/prisma';
import { writeProductFields } from '../../src/lib/product-fields';
import { computeAlertStatus, getAlerts, recomputeAlertStatuses, toggleAlertPause } from '../../src/services/alert.service';

/** Lets the fire-and-forget `void notifyPeakReached(...).catch(...)` settle before assertions run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** First `findMany` call arguments, narrowed for assertions. */
function firstFindManyArgs(): { where?: Record<string, unknown>; select?: Record<string, unknown> } {
  const call = vi.mocked(prisma.product.findMany).mock.calls[0];
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

/** The in-stock scope, spelled out to pin the SQL shape (lib/finished-item.ts). */
const IN_STOCK = {
  deletedAt: null,
  writtenOffAt: null,
  isOwned: true,
  // `not: null` keeps an opened bottle with no recorded level in stock.
  NOT: { isOpened: true, fillLevel: { equals: 0, not: null } },
};

/** A family as getAlerts reads it, with its oldest unit in stock (#471). */
function family(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Chambertin',
    producer: 'Domaine X',
    category: 'wine',
    vintage: 2020,
    peakMaturityFrom: 2028,
    peakMaturityTo: 2035,
    curveShape: null,
    alertsPaused: false,
    collection: null,
    photoUrl: null,
    items: [{ id: 'b1', cellarId: 'c1' }],
    ...overrides,
  };
}

/** A family as recomputeAlertStatuses reads it; `items` = a unit in stock, if any. */
function scanned(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-b1',
    name: 'Chambertin',
    producer: 'Domaine X',
    vintage: 2020,
    alertStatus: 'approaching',
    alertsPaused: false,
    peakMaturityFrom: 2028,
    peakMaturityTo: 2035,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    items: [{ id: 'b1' }],
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
  it('queries families by drinking window, not by the stored alertStatus column', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);

    await getAlerts();

    const { where, select } = firstFindManyArgs();
    expect(where).toEqual({
      deletedAt: null,
      alertsPaused: false,
      OR: [{ peakMaturityFrom: { not: null } }, { peakMaturityTo: { not: null } }],
      // #573 + FEAT-87 + #471: something left to drink — a unit in stock (not
      // finished, not written off, not a reference, not in the trash).
      items: { some: IN_STOCK },
    });
    expect(select).not.toHaveProperty('alertStatus');
    // The unit opened from the alert: in stock, oldest purchase first.
    expect(select?.items).toMatchObject({ where: IN_STOCK, take: 1 });
  });

  it('computes the status on read, so a window that opened since the last edit is reported', async () => {
    // Saved in 2026 as 'approaching'; in 2030 the bottle is at its peak.
    vi.mocked(prisma.product.findMany).mockResolvedValue([family()] as never);

    const alerts = await getAlerts();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.alertStatus).toBe('peak');
  });

  it('drops families whose window yields no alert and sorts by urgency', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      family({ id: 'p-approaching', items: [{ id: 'approaching', cellarId: null }], peakMaturityFrom: 2040, peakMaturityTo: 2050 }),
      family({ id: 'p-past', items: [{ id: 'past', cellarId: null }], peakMaturityFrom: 2010, peakMaturityTo: 2015 }),
      family({ id: 'p-none', items: [{ id: 'none', cellarId: null }], peakMaturityFrom: null, peakMaturityTo: null }),
      family({ id: 'p-peak', items: [{ id: 'peak', cellarId: null }] }),
    ] as never);

    const alerts = await getAlerts();

    expect(alerts.map((a) => a.id)).toEqual(['past', 'peak', 'approaching']);
  });

  // #471 (FEAT-96 c4): a wine of 9 bottles in 3 groups is one alert.
  it('returns one alert per family, carrying the unit to open and the family id', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([family()] as never);

    const [alert, ...others] = await getAlerts();

    expect(others).toEqual([]);
    expect(alert).toMatchObject({ id: 'b1', productId: 'p1', cellarId: 'c1', name: 'Chambertin', alertStatus: 'peak' });
    expect(alert).not.toHaveProperty('items');
  });
});

describe('recomputeAlertStatuses', () => {
  it('rewrites only the families whose stored status no longer matches the current year', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      scanned({ id: 'p-stale', alertStatus: 'approaching', peakMaturityFrom: 2028, peakMaturityTo: 2035 }),
      scanned({ id: 'p-fresh', alertStatus: 'past', peakMaturityFrom: 2010, peakMaturityTo: 2015 }),
    ] as never);

    const result = await recomputeAlertStatuses();

    expect(result).toEqual({ scanned: 2, updated: 1 });
    expect(writeProductFields).toHaveBeenCalledTimes(1);
    expect(writeProductFields).toHaveBeenCalledWith(
      {}, 'p-stale',
      // `updatedAt` is carried over untouched: this maintenance pass must not
      // look like a user edit (sort order + offline-sync conflict detection).
      { alertStatus: 'peak', updatedAt: new Date('2026-01-02T00:00:00.000Z') },
    );
  });

  it('scans every family that carries a drinking window, with or without stock', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([] as never);

    await recomputeAlertStatuses();

    // #573: a wine with nothing left in stock is still scanned (no stock
    // clause) so the status stored on its card stays current; it is only
    // skipped when notifying, which needs to know whether a unit is in stock.
    const { where, select } = firstFindManyArgs();
    expect(where).toEqual({
      deletedAt: null,
      OR: [{ peakMaturityFrom: { not: null } }, { peakMaturityTo: { not: null } }],
    });
    expect(select).toMatchObject({ updatedAt: true, items: { where: IN_STOCK, select: { id: true }, take: 1 } });
  });

  // #471 (FEAT-96 c4, plan report C): a wine of 9 bottles in 3 groups used to
  // be scanned as 3 units — written 3 times, notified 3 times.
  it('writes and notifies a family of several groups once', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([scanned()] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'EN', notifLanguage: null }] as never);

    const result = await recomputeAlertStatuses();
    await flush();

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect(writeProductFields).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].subject).toBe('At peak maturity: Chambertin — Domaine X (2020)');
  });

  // #338: the 'peak' notification category previously had no emitter at all.
  describe('peak-maturity notification (#338)', () => {
    it('notifies every member once a wine transitions into peak', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([scanned()] as never);
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
      vi.mocked(prisma.product.findMany).mockResolvedValue([
        scanned({ name: '<a href="https://evil.example">Sign in again</a>' }),
      ] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'EN', notifLanguage: null }] as never);

      await recomputeAlertStatuses();
      await flush();

      const body = send.mock.calls[0]?.[0].htmlBody as string;
      expect(body).not.toContain('<a href');
      expect(body).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
    });

    it('sends each member one digest when several wines reach peak together (#478)', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => scanned({ id: `p${i}`, name: `Wine b${i}` })) as never,
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

    it('does not notify when the wine has alerts paused', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([scanned({ alertsPaused: true })] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(send).not.toHaveBeenCalled();
    });

    it('does not re-notify on a tick where the stored status is already peak', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([scanned({ alertStatus: 'peak' })] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(writeProductFields).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    // #573: every bottle of the wine has been drunk (or written off, or it is
    // a FEAT-87 reference): no unit in stock.
    it('updates the status of a wine with nothing in stock reaching peak but does not notify about it', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([scanned({ id: 'p-drunk', items: [] })] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'EN', notifLanguage: null }] as never);

      const result = await recomputeAlertStatuses();
      await flush();

      // The stored column still follows the calendar...
      expect(result).toEqual({ scanned: 1, updated: 1 });
      expect(writeProductFields).toHaveBeenCalledWith(
        {}, 'p-drunk',
        { alertStatus: 'peak', updatedAt: new Date('2026-01-02T00:00:00.000Z') },
      );
      // ...but nobody is told to open a bottle already drunk.
      expect(send).not.toHaveBeenCalled();
    });

    it('leaves the drunk wine out of a run that also has a wine in stock reaching peak', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([
        scanned({ id: 'p-drunk', name: 'Wine drunk', items: [] }),
        scanned({ id: 'p-half', name: 'Wine half' }),
      ] as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'EN', notifLanguage: null }] as never);

      await recomputeAlertStatuses();
      await flush();

      expect(writeProductFields).toHaveBeenCalledTimes(2);
      // A single-wine message about the one in stock, not a two-wine digest.
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0].subject).toBe('At peak maturity: Wine half — Domaine X (2020)');
    });
  });
});

// #471: pausing the alerts is about the wine, so it is written on the family.
describe('toggleAlertPause', () => {
  it('flips the family\'s pause, mirrored onto its units', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(
      { id: 'b1', productId: 'p1', alertsPaused: true, product: { alertsPaused: false } } as never,
    );

    expect(await toggleAlertPause('b1')).toBe(true);

    expect(writeProductFields).toHaveBeenCalledWith({}, 'p1', { alertsPaused: true });
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('writes nothing for an unknown item', async () => {
    vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

    expect(await toggleAlertPause('missing')).toBe(false);
    expect(writeProductFields).not.toHaveBeenCalled();
  });
});
