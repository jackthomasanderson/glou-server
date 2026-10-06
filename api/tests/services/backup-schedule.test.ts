import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// #233 — backups were off by default, and on a fresh install the settings row
// did not even exist, so the nightly job silently never ran.

const upsert = vi.fn();
vi.mock('../../src/lib/prisma', () => ({ prisma: { systemConfig: { upsert: (...a: unknown[]) => upsert(...a) } } }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import { backupService } from '../../src/services/backup.service';

describe('backupService.runScheduledIfDue (#233)', () => {
  const run = vi.spyOn(backupService, 'runBackup');

  beforeEach(() => {
    upsert.mockReset();
    run.mockReset().mockResolvedValue({ id: 'r1', success: true } as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T03:10:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('creates the settings row when it is missing instead of skipping the backup', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHourUtc: 3 });
    await backupService.runScheduledIfDue();
    expect(upsert).toHaveBeenCalledWith({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
    expect(run).toHaveBeenCalledWith('scheduled');
  });

  it('runs at the configured UTC hour only', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHourUtc: 5 });
    await expect(backupService.runScheduledIfDue()).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('respects an operator who turned backups off', async () => {
    upsert.mockResolvedValue({ backupEnabled: false, backupHourUtc: 3 });
    await expect(backupService.runScheduledIfDue()).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
