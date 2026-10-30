import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// #233 — backups were off by default, and on a fresh install the settings row
// did not even exist, so the nightly job silently never ran.
// #234 — a run missed at the configured hour was never caught up, and a failure
// was reported to nobody.

const upsert = vi.fn();
const findFirst = vi.fn();
const runCreate = vi.fn();
const userFindMany = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    systemConfig: { upsert: (...a: unknown[]) => upsert(...a) },
    backupRun: { findFirst: (...a: unknown[]) => findFirst(...a), create: (...a: unknown[]) => runCreate(...a) },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
  },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
const send = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: (...a: unknown[]) => send(...a) } }));

import { backupService } from '../../src/services/backup.service';

const HOUR = 60 * 60 * 1000;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR);

describe('backupService.runScheduledIfDue', () => {
  let run: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    upsert.mockReset();
    findFirst.mockReset();
    run = vi.spyOn(backupService, 'runBackup').mockResolvedValue({ id: 'r1', success: true } as never);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T03:10:00Z')); // 03h UTC
  });
  afterEach(() => {
    vi.useRealTimers();
    run.mockRestore();
  });

  it('creates the settings row when it is missing instead of skipping the backup (#233)', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHourUtc: 3 });
    await backupService.runScheduledIfDue();
    expect(upsert).toHaveBeenCalledWith({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
    expect(run).toHaveBeenCalledWith('scheduled');
  });

  it('runs at the configured UTC hour without looking at past runs', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHourUtc: 3 });
    await backupService.runScheduledIfDue();
    expect(run).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('respects an operator who turned backups off', async () => {
    upsert.mockResolvedValue({ backupEnabled: false, backupHourUtc: 3 });
    await expect(backupService.runScheduledIfDue()).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('does nothing outside the hour when the last backup is recent (a normal day, 23 h)', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHourUtc: 5 });
    findFirst.mockResolvedValue({ runAt: at(23) });
    await expect(backupService.runScheduledIfDue()).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('catches up a missed backup at the next tick (#234)', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHourUtc: 2 }); // the 02h run was missed
    findFirst.mockResolvedValue({ runAt: at(25.5) });
    await backupService.runScheduledIfDue();
    expect(findFirst).toHaveBeenCalledWith({ where: { success: true }, orderBy: { runAt: 'desc' } });
    expect(run).toHaveBeenCalledWith('scheduled');
  });

  it('takes a first backup as soon as there is none at all', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHourUtc: 5 });
    findFirst.mockResolvedValue(null);
    await backupService.runScheduledIfDue();
    expect(run).toHaveBeenCalledWith('scheduled');
  });
});

describe('backupService.runBackup failure handling (#234)', () => {
  const realUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    findFirst.mockReset();
    runCreate.mockReset().mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'run', ...(data as object) }));
    userFindMany.mockReset().mockResolvedValue([
      { id: 'a1', language: 'FR', notifLanguage: null },
      { id: 'a2', language: 'EN', notifLanguage: null },
    ]);
    send.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.DATABASE_URL; // makes the run fail deterministically
  });
  afterEach(() => {
    process.env.DATABASE_URL = realUrl;
    vi.restoreAllMocks();
  });

  it('tells every administrator, in their language, and records the failed run', async () => {
    findFirst.mockResolvedValue({ success: true, runAt: at(24) });
    const out = await backupService.runBackup('scheduled');
    expect(out.success).toBe(false);
    expect(userFindMany).toHaveBeenCalledWith({ where: { isAdmin: true, isActive: true }, select: { id: true, language: true, notifLanguage: true } });
    expect(send).toHaveBeenCalledTimes(2);
    const [fr, en] = send.mock.calls.map((c) => c[0] as { userId: string; category: string; subject: string; bypassQuietHours: boolean });
    expect(fr).toMatchObject({ userId: 'a1', category: 'backup', bypassQuietHours: true });
    expect(fr.subject).toContain('échec');
    expect(en.subject).toContain('failed');
  });

  it('honours notifLanguage over the interface language (#406)', async () => {
    findFirst.mockResolvedValue({ success: true, runAt: at(24) });
    userFindMany.mockResolvedValue([{ id: 'a1', language: 'EN', notifLanguage: 'FR' }]);
    await backupService.runBackup('scheduled');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toContain('échec');
  });

  it('notifies on the very first failure when there was no earlier run', async () => {
    findFirst.mockResolvedValue(null);
    await backupService.runBackup('scheduled');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not repeat the alert for the hourly retry of an already reported failure', async () => {
    findFirst.mockResolvedValue({ success: false, runAt: at(1) });
    await backupService.runBackup('scheduled');
    expect(runCreate).toHaveBeenCalled(); // still recorded
    expect(send).not.toHaveBeenCalled();
  });

  it('alerts again once a day while the failure persists', async () => {
    findFirst.mockResolvedValue({ success: false, runAt: at(25) });
    await backupService.runBackup('scheduled');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('puts the error in the email body and never applies retention after a failed dump', async () => {
    findFirst.mockResolvedValue(null);
    userFindMany.mockResolvedValue([{ id: 'a1', language: 'EN' }]);
    const spy = vi.spyOn(backupService, 'enforceRetention');
    await backupService.runBackup('scheduled');
    expect(send.mock.calls[0][0].htmlBody).toContain('<pre>DATABASE_URL_NOT_SET</pre>');
    // retention is only applied after a successful dump, never when it failed
    expect(spy).not.toHaveBeenCalled();
  });

  // #666: every failed backup was announced as "the scheduled backup", even
  // one started by hand or the safety copy taken before a restore.
  it.each([
    ['scheduled', {}, 'The scheduled database backup failed', 'La sauvegarde planifiée de la base a échoué'],
    ['manual', {}, 'A database backup started from the admin panel failed', "Une sauvegarde de la base lancée depuis l'administration a échoué"],
    ['manual', { beforeRestore: true }, 'taken before a restore failed', 'prise avant une restauration a échoué'],
  ] as const)('names the %s backup %o for what it is, in both languages', async (trigger, options, en, fr) => {
    findFirst.mockResolvedValue(null);
    await backupService.runBackup(trigger, undefined, options);
    const [frBody, enBody] = send.mock.calls.map((c) => (c[0] as { htmlBody: string }).htmlBody);
    expect(enBody).toContain(en);
    expect(frBody).toContain(fr);
    if (trigger === 'manual') {
      expect(enBody).not.toContain('scheduled');
      expect(frBody).not.toContain('planifiée');
    }
  });

  it('a notification failure never breaks the backup bookkeeping', async () => {
    findFirst.mockResolvedValue(null);
    send.mockRejectedValueOnce(new Error('smtp down'));
    const out = await backupService.runBackup('scheduled');
    expect(out.success).toBe(false);
  });
});
