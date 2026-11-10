import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => {
  const prisma = {
    systemConfig: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() },
    configChangeLog: { create: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return { prisma };
});

import { prisma } from '../../src/lib/prisma';
import { encrypt } from '../../src/lib/crypto';
import { systemConfigService } from '../../src/services/system-config.service';

// #760 / #628: the configuration history records only what changed, with the
// previous and the new value, secrets masked — and nothing when nothing changed.

let saved: Record<string, unknown>;

beforeAll(() => {
  process.env.CONFIG_ENCRYPTION_KEY = 'a'.repeat(64);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: typeof prisma) => unknown) => fn(prisma)) as never);
  saved = {
    id: 'singleton',
    smtpEnabled: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'mailer',
    smtpPassEnc: encrypt('hunter2'),
    smtpFrom: 'glou@example.com',
    smtpSecure: false,
    gotifyEnabled: false,
    gotifyUrl: null,
    gotifyTokenEnc: null,
    logRetentionDays: 90,
    sessionRetentionDays: 30,
    guestShareRetentionDays: 30,
    publicUrl: null,
    registrationOpen: false,
    backupEnabled: true,
    backupRetentionDays: 7,
    backupHour: 3,
    backupHourIsUtc: false,
  };
  vi.mocked(prisma.systemConfig.findUnique).mockImplementation((async () => ({ ...saved })) as never);
  vi.mocked(prisma.systemConfig.findUniqueOrThrow).mockImplementation((async () => ({ ...saved })) as never);
  vi.mocked(prisma.systemConfig.update).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => {
    saved = { ...saved, ...data };
    return saved;
  }) as never);
});

function written() {
  const calls = vi.mocked(prisma.configChangeLog.create).mock.calls;
  return calls.map(([arg]) => {
    const data = (arg as { data: { fieldName: string; maskedOldVal: string | null; maskedNewVal: string | null } }).data;
    return {
      fieldName: data.fieldName,
      old: data.maskedOldVal === null ? null : JSON.parse(data.maskedOldVal),
      new: data.maskedNewVal === null ? null : JSON.parse(data.maskedNewVal),
    };
  });
}

describe('configuration history (#760, #628)', () => {
  it('saving a form with nothing changed writes no history entry', async () => {
    await systemConfigService.updateBackupConfig({ backupEnabled: true, backupRetentionDays: 7, backupHour: 3 }, 'admin');
    await systemConfigService.updateSmtp({
      smtpEnabled: true, smtpHost: 'smtp.example.com', smtpPort: 587, smtpUser: 'mailer',
      smtpFrom: 'glou@example.com', smtpSecure: false, smtpPass: 'hunter2',
    }, 'admin');
    expect(prisma.configChangeLog.create).not.toHaveBeenCalled();
  });

  it('records only the changed fields, with their previous and new values', async () => {
    await systemConfigService.updateBackupConfig({ backupEnabled: true, backupRetentionDays: 7, backupHour: 4 }, 'admin');
    expect(written()).toEqual([{ fieldName: 'backup', old: { backupHour: 3 }, new: { backupHour: 4 } }]);
  });

  it('never records a secret, only that it changed or was removed', async () => {
    await systemConfigService.updateSmtp({ smtpPass: 'correct horse' }, 'admin');
    await systemConfigService.updateSmtp({ smtpPass: null }, 'admin');
    await systemConfigService.updateGotify({ gotifyToken: 'tok' }, 'admin');
    const entries = written();
    expect(entries).toEqual([
      { fieldName: 'smtp', old: { smtpPassEnc: '••••••••' }, new: { smtpPassEnc: '••••••••' } },
      { fieldName: 'smtp', old: { smtpPassEnc: '••••••••' }, new: { smtpPassEnc: null } },
      { fieldName: 'gotify', old: { gotifyTokenEnc: null }, new: { gotifyTokenEnc: '••••••••' } },
    ]);
    expect(JSON.stringify(vi.mocked(prisma.configChangeLog.create).mock.calls)).not.toMatch(/hunter2|correct horse|tok"/);
  });

  it('does not log the internal "updatedBy" bookkeeping field', async () => {
    await systemConfigService.updateRegistrationConfig({ registrationOpen: true }, 'admin');
    expect(written()).toEqual([{ fieldName: 'registration', old: { registrationOpen: false }, new: { registrationOpen: true } }]);
  });

  it('records only configuration columns, never a stray key such as a password', async () => {
    await systemConfigService.updateRegistrationConfig({ registrationOpen: true, password: 'step-up secret' } as never, 'admin');
    expect(written()).toEqual([{ fieldName: 'registration', old: { registrationOpen: false }, new: { registrationOpen: true } }]);
  });

  it('reads the previous value, saves and logs inside one locked transaction', async () => {
    await systemConfigService.updateBackupConfig({ backupEnabled: true, backupRetentionDays: 7, backupHour: 5 }, 'admin');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String((vi.mocked(prisma.$queryRaw).mock.calls[0][0] as unknown as string[]).join('?'))).toMatch(/FOR UPDATE/);
  });
});

// #761 (review of #926): an hour the admin saves is always an hour of the
// instance's time zone. If the startup conversion failed and left the "still
// UTC" flag on, saving must clear it, or the next startup would shift the
// admin's local hour by the UTC offset. The flag never shows in the history.
describe('saving the backup settings (#761)', () => {
  it('clears the legacy UTC flag, without a history line for it', async () => {
    saved = { ...saved, backupHourIsUtc: true };

    await systemConfigService.updateBackupConfig({ backupEnabled: true, backupRetentionDays: 7, backupHour: 5 }, 'admin');

    expect(saved).toMatchObject({ backupHour: 5, backupHourIsUtc: false });
    expect(written()).toEqual([{ fieldName: 'backup', old: { backupHour: 3 }, new: { backupHour: 5 } }]);
  });
});
