import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    systemConfig: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    configChangeLog: { create: vi.fn(), findMany: vi.fn() },
  },
}));

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
    inAppEnabled: true,
    logRetentionDays: 90,
    sessionRetentionDays: 30,
    guestShareRetentionDays: 30,
    publicUrl: null,
    accessMode: 'direct',
    registrationOpen: false,
    backupEnabled: true,
    backupRetentionDays: 7,
    backupHourUtc: 3,
  };
  vi.mocked(prisma.systemConfig.findUnique).mockImplementation((async () => ({ ...saved })) as never);
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
    await systemConfigService.updateBackupConfig({ backupEnabled: true, backupRetentionDays: 7, backupHourUtc: 3 }, 'admin');
    await systemConfigService.updateSmtp({
      smtpEnabled: true, smtpHost: 'smtp.example.com', smtpPort: 587, smtpUser: 'mailer',
      smtpFrom: 'glou@example.com', smtpSecure: false, smtpPass: 'hunter2',
    }, 'admin');
    expect(prisma.configChangeLog.create).not.toHaveBeenCalled();
  });

  it('records only the changed fields, with their previous and new values', async () => {
    await systemConfigService.updateBackupConfig({ backupEnabled: true, backupRetentionDays: 7, backupHourUtc: 4 }, 'admin');
    expect(written()).toEqual([{ fieldName: 'backup', old: { backupHourUtc: 3 }, new: { backupHourUtc: 4 } }]);
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
});
