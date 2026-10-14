import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    cellar: { findFirst: vi.fn(), findMany: vi.fn() },
    humidorReading: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));
vi.mock('../../src/services/notification.service', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { prisma } from '../../src/lib/prisma';
import { notificationService } from '../../src/services/notification.service';
import { humidorService, checkHumidorDrift } from '../../src/services/humidor.service';

beforeEach(() => vi.clearAllMocks());

describe('humidorService.recordReading', () => {
  it('returns null when the target cellar does not exist', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue(null);
    expect(await humidorService.recordReading('u1', { cellarId: 'nope', humidityPercent: 65, source: 'manual' })).toBeNull();
    expect(prisma.humidorReading.create).not.toHaveBeenCalled();
  });

  it('reports "unconfigured" drift when the cellar has no target range', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({
      id: 'c1', name: 'Humidor', targetHumidityMin: null, targetHumidityMax: null,
    } as never);
    vi.mocked(prisma.humidorReading.create).mockResolvedValue({ humidityPercent: 65 } as never);

    const res = await humidorService.recordReading('u1', { cellarId: 'c1', humidityPercent: 65, source: 'manual' });
    expect(res?.drift).toBe('unconfigured');
    expect(notificationService.send).not.toHaveBeenCalled();
  });

  it('reports "in_range" without notifying', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({
      id: 'c1', name: 'Humidor', targetHumidityMin: 62, targetHumidityMax: 72,
    } as never);
    vi.mocked(prisma.humidorReading.create).mockResolvedValue({ humidityPercent: 68 } as never);

    const res = await humidorService.recordReading('u1', { cellarId: 'c1', humidityPercent: 68, source: 'manual' });
    expect(res?.drift).toBe('in_range');
    expect(notificationService.send).not.toHaveBeenCalled();
  });

  it('reports "out_of_range" and broadcasts a drift notification to every member (ISSUE_027)', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({
      id: 'c1', name: 'Humidor', targetHumidityMin: 62, targetHumidityMax: 72,
    } as never);
    vi.mocked(prisma.humidorReading.create).mockResolvedValue({ humidityPercent: 80 } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', language: 'FR', notifLanguage: null },
      { id: 'u2', language: 'EN', notifLanguage: null },
    ] as never);

    const res = await humidorService.recordReading('u1', { cellarId: 'c1', humidityPercent: 80, source: 'manual' });
    expect(res?.drift).toBe('out_of_range');
    // notification is fire-and-forget — let the microtask queue drain
    await new Promise((r) => setImmediate(r));
    expect(notificationService.send).toHaveBeenCalledTimes(2);
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', category: 'temperature' }),
    );
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', category: 'temperature' }),
    );
  });

  it('defaults recordedAt to now and temperature to null', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({
      id: 'c1', name: 'H', targetHumidityMin: null, targetHumidityMax: null,
    } as never);
    vi.mocked(prisma.humidorReading.create).mockResolvedValue({ humidityPercent: 65 } as never);

    await humidorService.recordReading('u1', { cellarId: 'c1', humidityPercent: 65, source: 'manual' });
    const arg = vi.mocked(prisma.humidorReading.create).mock.calls[0][0] as unknown as { data: Record<string, unknown> };
    expect(arg.data.temperatureCelsius).toBeNull();
    expect(arg.data.recordedAt).toBeInstanceOf(Date);
  });
});

describe('humidorService.getHistory', () => {
  it('returns null for an unknown cellar', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue(null);
    expect(await humidorService.getHistory('nope')).toBeNull();
  });

  it('derives latest + drift from the most recent reading', async () => {
    vi.mocked(prisma.cellar.findFirst).mockResolvedValue({
      id: 'c1', targetHumidityMin: 62, targetHumidityMax: 72,
    } as never);
    vi.mocked(prisma.humidorReading.findMany).mockResolvedValue([
      { humidityPercent: 90, recordedAt: new Date('2026-08-30') },
      { humidityPercent: 65, recordedAt: new Date('2026-08-29') },
    ] as never);

    const res = await humidorService.getHistory('c1');
    expect(res?.latest).toMatchObject({ humidityPercent: 90 });
    expect(res?.drift).toBe('out_of_range');
  });
});

describe('checkHumidorDrift (ISSUE_027)', () => {
  const EIGHT_DAYS_AGO = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const ONE_DAY_AGO = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

  it('only scans cellars with a configured target range', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([]);
    const res = await checkHumidorDrift();
    expect(prisma.cellar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetHumidityMin: { not: null }, targetHumidityMax: { not: null } },
      }),
    );
    expect(res).toEqual({ scanned: 0, alerted: 0 });
  });

  it('broadcasts a "stale" alert when the last reading is older than 7 days', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Humidor', createdAt: EIGHT_DAYS_AGO, targetHumidityMin: 62, targetHumidityMax: 72 },
    ] as never);
    vi.mocked(prisma.humidorReading.findFirst).mockResolvedValue({
      humidityPercent: 68, recordedAt: EIGHT_DAYS_AGO,
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'FR', notifLanguage: null }] as never);

    const res = await checkHumidorDrift();
    expect(res).toEqual({ scanned: 1, alerted: 1 });
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', category: 'temperature' }),
    );
  });

  it('broadcasts a "stale" alert when a monitored cellar has no reading at all past the grace period', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Humidor', createdAt: EIGHT_DAYS_AGO, targetHumidityMin: 62, targetHumidityMax: 72 },
    ] as never);
    vi.mocked(prisma.humidorReading.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'FR', notifLanguage: null }] as never);

    const res = await checkHumidorDrift();
    expect(res).toEqual({ scanned: 1, alerted: 1 });
    expect(notificationService.send).toHaveBeenCalledTimes(1);
  });

  it('does not alert a newly configured cellar that has no reading yet within the grace period', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Humidor', createdAt: ONE_DAY_AGO, targetHumidityMin: 62, targetHumidityMax: 72 },
    ] as never);
    vi.mocked(prisma.humidorReading.findFirst).mockResolvedValue(null);

    const res = await checkHumidorDrift();
    expect(res).toEqual({ scanned: 1, alerted: 0 });
    expect(notificationService.send).not.toHaveBeenCalled();
  });

  it('broadcasts a drift alert when the last (recent) reading is still out of range', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Humidor', createdAt: EIGHT_DAYS_AGO, targetHumidityMin: 62, targetHumidityMax: 72 },
    ] as never);
    vi.mocked(prisma.humidorReading.findFirst).mockResolvedValue({
      humidityPercent: 90, recordedAt: ONE_DAY_AGO,
    } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', language: 'FR', notifLanguage: null }] as never);

    const res = await checkHumidorDrift();
    expect(res).toEqual({ scanned: 1, alerted: 1 });
  });

  it('does not alert a cellar whose recent reading is back in range', async () => {
    vi.mocked(prisma.cellar.findMany).mockResolvedValue([
      { id: 'c1', name: 'Humidor', createdAt: EIGHT_DAYS_AGO, targetHumidityMin: 62, targetHumidityMax: 72 },
    ] as never);
    vi.mocked(prisma.humidorReading.findFirst).mockResolvedValue({
      humidityPercent: 68, recordedAt: ONE_DAY_AGO,
    } as never);

    const res = await checkHumidorDrift();
    expect(res).toEqual({ scanned: 1, alerted: 0 });
    expect(notificationService.send).not.toHaveBeenCalled();
  });
});
