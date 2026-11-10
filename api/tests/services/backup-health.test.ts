import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// #671 — a failed nightly backup was reported only by email or Gotify, both off
// on a standard install: nobody knew. The status read by the admins' banner
// says whether the last run failed and whether the last success is too old.

const configFindUnique = vi.fn();
const findFirst = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    systemConfig: { findUnique: (...a: unknown[]) => configFindUnique(...a) },
    backupRun: { findFirst: (...a: unknown[]) => findFirst(...a) },
  },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));

import { backupService } from '../../src/services/backup.service';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR);

/** The last successful run and the last run of any outcome, as the two queries ask for them. */
function history({ lastSuccess, lastRun }: { lastSuccess: Date | null; lastRun: { success: boolean } | null }) {
  findFirst.mockImplementation(async (args: { where?: { success?: boolean } }) =>
    args?.where?.success ? (lastSuccess ? { runAt: lastSuccess } : null) : lastRun);
}

describe('backupService.getStatus — the backup alert (#671)', () => {
  beforeEach(() => {
    configFindUnique.mockReset().mockResolvedValue({ backupEnabled: true });
    findFirst.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('raises nothing after a recent successful backup', async () => {
    history({ lastSuccess: hoursAgo(5), lastRun: { success: true } });
    expect(await backupService.getStatus()).toEqual({
      backupEnabled: true, lastSuccessAt: hoursAgo(5), lastRunFailed: false, overdue: false,
    });
  });

  it('flags a last run that failed, even right after an earlier success', async () => {
    history({ lastSuccess: hoursAgo(5), lastRun: { success: false } });
    expect(await backupService.getStatus()).toMatchObject({ lastRunFailed: true, overdue: false });
  });

  it('flags a last success older than 48 hours', async () => {
    history({ lastSuccess: hoursAgo(49), lastRun: { success: true } });
    expect(await backupService.getStatus()).toMatchObject({ lastRunFailed: false, overdue: true });
  });

  it('does not flag a last success just under 48 hours old (a missed night is caught up first)', async () => {
    history({ lastSuccess: hoursAgo(47), lastRun: { success: true } });
    expect(await backupService.getStatus()).toMatchObject({ overdue: false });
  });

  it('does not call backups overdue while they are switched off (that is said apart)', async () => {
    configFindUnique.mockResolvedValue({ backupEnabled: false });
    history({ lastSuccess: hoursAgo(24 * 30), lastRun: { success: true } });
    expect(await backupService.getStatus()).toMatchObject({ backupEnabled: false, overdue: false });
  });

  it('still reports a failed run while backups are switched off', async () => {
    configFindUnique.mockResolvedValue({ backupEnabled: false });
    history({ lastSuccess: hoursAgo(5), lastRun: { success: false } });
    expect(await backupService.getStatus()).toMatchObject({ lastRunFailed: true });
  });

  it('raises nothing before any backup ran (the admin page says "no backup yet")', async () => {
    history({ lastSuccess: null, lastRun: null });
    expect(await backupService.getStatus()).toEqual({
      backupEnabled: true, lastSuccessAt: null, lastRunFailed: false, overdue: false,
    });
  });
});
