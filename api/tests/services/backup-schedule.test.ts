import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// #233 — backups were off by default, and on a fresh install the settings row
// did not even exist, so the nightly job silently never ran.
// #234 — a run missed at the configured hour was never caught up, and a failure
// was reported to nobody.

const upsert = vi.fn();
const configFindUnique = vi.fn();
const configUpdateMany = vi.fn();
const findFirst = vi.fn();
const runCreate = vi.fn();
const userFindMany = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    systemConfig: {
      upsert: (...a: unknown[]) => upsert(...a),
      findUnique: (...a: unknown[]) => configFindUnique(...a),
      updateMany: (...a: unknown[]) => configUpdateMany(...a),
    },
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

/** Runs the test body with the process in `tz`, as the API container's `TZ` sets it (#575, #761). */
function withTimeZone(tz: string) {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.TZ;
    process.env.TZ = tz;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

describe('backupService.runScheduledIfDue', () => {
  let run: ReturnType<typeof vi.spyOn>;
  withTimeZone('UTC');

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
    upsert.mockResolvedValue({ backupEnabled: true, backupHour: 3 });
    await backupService.runScheduledIfDue();
    expect(upsert).toHaveBeenCalledWith({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
    expect(run).toHaveBeenCalledWith('scheduled');
  });

  it('runs at the configured hour without looking at past runs', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHour: 3 });
    await backupService.runScheduledIfDue();
    expect(run).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('respects an operator who turned backups off', async () => {
    upsert.mockResolvedValue({ backupEnabled: false, backupHour: 3 });
    await expect(backupService.runScheduledIfDue()).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('does nothing outside the hour when the last backup is recent (a normal day, 23 h)', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHour: 5 });
    findFirst.mockResolvedValue({ runAt: at(23) });
    await expect(backupService.runScheduledIfDue()).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('catches up a missed backup at the next tick (#234)', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHour: 2 }); // the 02h run was missed
    findFirst.mockResolvedValue({ runAt: at(25.5) });
    await backupService.runScheduledIfDue();
    expect(findFirst).toHaveBeenCalledWith({ where: { success: true }, orderBy: { runAt: 'desc' } });
    expect(run).toHaveBeenCalledWith('scheduled');
  });

  it('takes a first backup as soon as there is none at all', async () => {
    upsert.mockResolvedValue({ backupEnabled: true, backupHour: 5 });
    findFirst.mockResolvedValue(null);
    await backupService.runScheduledIfDue();
    expect(run).toHaveBeenCalledWith('scheduled');
  });
});

// #761: the backup hour is an hour of the instance's time zone, like the
// nightly cleanup and the alerts, so it does not move with daylight saving.
describe('backupService.runScheduledIfDue in the instance time zone (#761)', () => {
  let run: ReturnType<typeof vi.spyOn>;
  withTimeZone('Europe/Paris');

  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({ backupEnabled: true, backupHour: 3 });
    findFirst.mockReset().mockResolvedValue({ runAt: new Date(Date.now() - 2 * HOUR) });
    run = vi.spyOn(backupService, 'runBackup').mockResolvedValue({ id: 'r1', success: true } as never);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    run.mockRestore();
  });

  it.each([
    ['in winter (UTC+1)', '2026-01-15T02:10:00Z', '2026-01-15T03:10:00Z'],
    ['in summer (UTC+2)', '2026-07-15T01:10:00Z', '2026-07-15T03:10:00Z'],
  ])('runs at 3:00 Paris time %s, not at 3:00 UTC', async (_season, threeInParis, threeUtc) => {
    vi.setSystemTime(new Date(threeInParis));
    findFirst.mockResolvedValue({ runAt: new Date(Date.now() - 23 * HOUR) });
    await backupService.runScheduledIfDue();
    expect(run).toHaveBeenCalledWith('scheduled');

    run.mockClear();
    vi.setSystemTime(new Date(threeUtc));
    findFirst.mockResolvedValue({ runAt: new Date(Date.now() - 1 * HOUR) });
    await expect(backupService.runScheduledIfDue()).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

// #761: an instance updated from a version where the hour was in UTC keeps its
// backup at the same real time (for the current season), converted once.
describe('backupService.convertLegacyUtcBackupHour (#761)', () => {
  withTimeZone('Europe/Paris');

  beforeEach(() => {
    configFindUnique.mockReset();
    configUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ['in winter', '2026-01-15T12:00:00Z', 3, 4],
    ['in summer', '2026-07-15T12:00:00Z', 3, 5],
    ['across midnight', '2026-07-15T12:00:00Z', 23, 1],
  ])('turns a stored UTC hour into the same real hour of the instance %s', async (_when, now, utcHour, localHour) => {
    vi.setSystemTime(new Date(now));
    configFindUnique.mockResolvedValue({ backupHour: utcHour, backupHourIsUtc: true });

    await expect(backupService.convertLegacyUtcBackupHour()).resolves.toBe(localHour);

    // Conditional on the flag: a second API starting at the same time converts nothing.
    expect(configUpdateMany).toHaveBeenCalledWith({
      where: { id: 'singleton', backupHourIsUtc: true },
      data: { backupHour: localHour, backupHourIsUtc: false },
    });
  });

  it('does nothing once converted, or on a fresh install', async () => {
    configFindUnique.mockResolvedValueOnce({ backupHour: 3, backupHourIsUtc: false }).mockResolvedValueOnce(null);

    await expect(backupService.convertLegacyUtcBackupHour()).resolves.toBeNull();
    await expect(backupService.convertLegacyUtcBackupHour()).resolves.toBeNull();
    expect(configUpdateMany).not.toHaveBeenCalled();
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
