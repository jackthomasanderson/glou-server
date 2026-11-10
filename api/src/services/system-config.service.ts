import { prisma, type PrismaClientOrTx } from '../lib/prisma';
import { encrypt, decrypt, maskSecret } from '../lib/crypto';
import { SystemConfig } from '@prisma/client';
import { instanceTimeZone } from '../lib/quiet-hours';

export interface SmtpConfig {
  smtpEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null; // plaintext (decrypted)
  smtpFrom: string | null;
  smtpSecure: boolean;
}

export interface GotifyConfig {
  gotifyEnabled: boolean;
  gotifyUrl: string | null;
  gotifyToken: string | null; // plaintext (decrypted)
}

export type NotificationPolicyConfig = {
  smtpEnabled: boolean;
  gotifyEnabled: boolean;
  inAppEnabled: boolean;
};

export type RetentionConfig = {
  logRetentionDays: number;
  sessionRetentionDays: number;
  guestShareRetentionDays: number;
};

// ─── FEAT-18: Scheduled Backups ───────────────────────────────────────────────

export type BackupConfig = {
  backupEnabled: boolean;
  backupRetentionDays: number;
  backupHour: number;
};

// ─── FEAT-54: Network Configuration & External Access ────────────────────────

export type NetworkConfigInput = {
  publicUrl?: string | null;
};

export type NetworkCheckResult = {
  ok: boolean;
  warnings: string[];
};

// ─── #73: Close registrations by default ─────────────────────────────────────

export type RegistrationConfig = {
  registrationOpen: boolean;
};

const DEFAULT_APP_URL = 'http://localhost:3000';

/** `publicUrl` if set (non-empty), else `process.env.APP_URL`, else the hardcoded default. */
function resolveEffectivePublicUrl(publicUrl: string | null): string {
  if (publicUrl && publicUrl.trim() !== '') return publicUrl;
  return process.env.APP_URL ?? DEFAULT_APP_URL;
}

export type PublicSystemConfig = {
  smtpEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassMasked: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
  gotifyEnabled: boolean;
  gotifyUrl: string | null;
  gotifyTokenMasked: string | null;
  inAppEnabled: boolean;
  logRetentionDays: number;
  sessionRetentionDays: number;
  guestShareRetentionDays: number;
  publicUrl: string | null;
  // Resolved URL actually used by the app (publicUrl, or APP_URL, or the localhost default).
  effectivePublicUrl: string;
  registrationOpen: boolean;
  backupEnabled: boolean;
  backupRetentionDays: number;
  /** #761: an hour of `timeZone`. */
  backupHour: number;
  /** #761: the instance's time zone (`TZ`), in which every scheduled job runs. */
  timeZone: string;
  updatedAt: Date | null;
  updatedBy: string | null;
};

// ─── #760: configuration history ────────────────────────────────────────────

/** What the history shows in place of a secret that is set. */
const SECRET_MASK = '••••••••';

function maskStored(value: unknown): string | null {
  return value ? SECRET_MASK : null;
}

/** Ciphertexts differ on every save: compare what they decrypt to. */
function sameSecret(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    return decrypt(String(a)) === decrypt(String(b));
  } catch {
    return false;
  }
}

async function getOrCreate(): Promise<SystemConfig> {
  let config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  if (!config) {
    config = await prisma.systemConfig.create({ data: { id: 'singleton' } });
  }
  return config;
}

/**
 * #760 / #628: records only the settings that actually changed, with their
 * previous and new values as two JSON objects keyed by field name. Only
 * columns of the configuration are considered, so a stray key (a step-up
 * password, say) can never be written. Encrypted secrets (`…Enc`) are never
 * written: SECRET_MASK when set, null when empty. Nothing is recorded when
 * the save changed nothing.
 */
async function logChange(db: PrismaClientOrTx, userId: string, section: string, old: SystemConfig, next: Record<string, unknown>) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const previous = old as unknown as Record<string, unknown>;
  for (const [field, value] of Object.entries(next)) {
    if (field === 'updatedBy' || value === undefined || !Object.hasOwn(previous, field)) continue;
    const was = previous[field] ?? null;
    const isSecret = field.endsWith('Enc');
    if (isSecret ? sameSecret(was, value) : was === (value ?? null)) continue;
    before[field] = isSecret ? maskStored(was) : was;
    after[field] = isSecret ? maskStored(value) : value ?? null;
  }
  if (Object.keys(after).length === 0) return;
  await db.configChangeLog.create({
    data: {
      userId,
      fieldName: section,
      maskedOldVal: JSON.stringify(before),
      maskedNewVal: JSON.stringify(after),
    },
  });
}

/**
 * Saves `data` and records the change in one transaction; the row is locked
 * first, so two admins saving at once each log the value they replaced.
 * `unlogged`: internal columns written with it, never shown in the history.
 */
async function saveAndLog(userId: string, section: string, data: Record<string, unknown>, unlogged: Record<string, unknown> = {}): Promise<void> {
  await getOrCreate();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "SystemConfig" WHERE "id" = 'singleton' FOR UPDATE`;
    const old = await tx.systemConfig.findUniqueOrThrow({ where: { id: 'singleton' } });
    await tx.systemConfig.update({ where: { id: 'singleton' }, data: { ...data, ...unlogged, updatedBy: userId } });
    await logChange(tx, userId, section, old, data);
  });
}

export const systemConfigService = {
  async getPublic(): Promise<PublicSystemConfig> {
    const cfg = await getOrCreate();
    return {
      smtpEnabled: cfg.smtpEnabled,
      smtpHost: cfg.smtpHost,
      smtpPort: cfg.smtpPort,
      smtpUser: cfg.smtpUser,
      smtpPassMasked: maskSecret(cfg.smtpPassEnc),
      smtpFrom: cfg.smtpFrom,
      smtpSecure: cfg.smtpSecure,
      gotifyEnabled: cfg.gotifyEnabled,
      gotifyUrl: cfg.gotifyUrl,
      gotifyTokenMasked: maskSecret(cfg.gotifyTokenEnc),
      inAppEnabled: cfg.inAppEnabled,
      logRetentionDays: cfg.logRetentionDays,
      sessionRetentionDays: cfg.sessionRetentionDays,
      guestShareRetentionDays: cfg.guestShareRetentionDays,
      publicUrl: cfg.publicUrl,
      effectivePublicUrl: resolveEffectivePublicUrl(cfg.publicUrl),
      registrationOpen: cfg.registrationOpen,
      backupEnabled: cfg.backupEnabled,
      backupRetentionDays: cfg.backupRetentionDays,
      backupHour: cfg.backupHour,
      timeZone: instanceTimeZone(),
      updatedAt: cfg.updatedAt,
      updatedBy: cfg.updatedBy,
    };
  },

  async getSmtp(): Promise<SmtpConfig> {
    const cfg = await getOrCreate();
    return {
      smtpEnabled: cfg.smtpEnabled,
      smtpHost: cfg.smtpHost,
      smtpPort: cfg.smtpPort,
      smtpUser: cfg.smtpUser,
      smtpPass: cfg.smtpPassEnc ? decrypt(cfg.smtpPassEnc) : null,
      smtpFrom: cfg.smtpFrom,
      smtpSecure: cfg.smtpSecure,
    };
  },

  async getGotify(): Promise<GotifyConfig> {
    const cfg = await getOrCreate();
    return {
      gotifyEnabled: cfg.gotifyEnabled,
      gotifyUrl: cfg.gotifyUrl,
      gotifyToken: cfg.gotifyTokenEnc ? decrypt(cfg.gotifyTokenEnc) : null,
    };
  },

  async updateSmtp(data: Partial<SmtpConfig & { smtpPass?: string | null }>, userId: string): Promise<PublicSystemConfig> {
    const update: Record<string, unknown> = { updatedBy: userId };

    if (data.smtpEnabled !== undefined) update.smtpEnabled = data.smtpEnabled;
    if (data.smtpHost !== undefined) update.smtpHost = data.smtpHost;
    if (data.smtpPort !== undefined) update.smtpPort = data.smtpPort;
    if (data.smtpUser !== undefined) update.smtpUser = data.smtpUser;
    if (data.smtpFrom !== undefined) update.smtpFrom = data.smtpFrom;
    if (data.smtpSecure !== undefined) update.smtpSecure = data.smtpSecure;
    if (data.smtpPass !== undefined) {
      update.smtpPassEnc = data.smtpPass ? encrypt(data.smtpPass) : null;
    }

    await saveAndLog(userId, 'smtp', update);
    return this.getPublic();
  },

  async updateGotify(data: Partial<GotifyConfig & { gotifyToken?: string | null }>, userId: string): Promise<PublicSystemConfig> {
    const update: Record<string, unknown> = { updatedBy: userId };

    if (data.gotifyEnabled !== undefined) update.gotifyEnabled = data.gotifyEnabled;
    if (data.gotifyUrl !== undefined) update.gotifyUrl = data.gotifyUrl;
    if (data.gotifyToken !== undefined) {
      update.gotifyTokenEnc = data.gotifyToken ? encrypt(data.gotifyToken) : null;
    }

    await saveAndLog(userId, 'gotify', update);
    return this.getPublic();
  },

  async updateNotificationPolicy(data: NotificationPolicyConfig, userId: string): Promise<PublicSystemConfig> {
    await saveAndLog(userId, 'notifications', data);
    return this.getPublic();
  },

  async updateRetention(data: RetentionConfig, userId: string): Promise<PublicSystemConfig> {
    await saveAndLog(userId, 'retention', data);
    return this.getPublic();
  },

  async updateBackupConfig(data: BackupConfig, userId: string): Promise<PublicSystemConfig> {
    // #761: the hour sent is always local; a flag left on by a failed startup
    // conversion would make the next startup shift it by the UTC offset.
    await saveAndLog(userId, 'backup', data, { backupHourIsUtc: false });
    return this.getPublic();
  },

  /**
   * The public URL actually used to build absolute links (QR codes, security
   * emails, password reset links...). Rétrocompatible: falls back to
   * `process.env.APP_URL`, then to 'http://localhost:3000', exactly as the
   * call sites did before FEAT-54 introduced the admin-configurable value.
   */
  async getEffectivePublicUrl(): Promise<string> {
    const cfg = await getOrCreate();
    return resolveEffectivePublicUrl(cfg.publicUrl);
  },

  async updateNetworkConfig(data: NetworkConfigInput, userId: string): Promise<PublicSystemConfig> {
    if (data.publicUrl) {
      try {
        void new URL(data.publicUrl);
      } catch {
        throw new Error('INVALID_PUBLIC_URL');
      }
    }

    const update: Record<string, unknown> = {};
    if (data.publicUrl !== undefined) {
      update.publicUrl = data.publicUrl && data.publicUrl.trim() !== '' ? data.publicUrl : null;
    }

    await saveAndLog(userId, 'network', update);
    return this.getPublic();
  },

  /**
   * Non-blocking consistency check for the network configuration. Deliberately
   * avoids any outbound self-fetch to the configured URL: DNS may not have
   * propagated yet, the reverse proxy may not be live yet, etc. — a network
   * probe would produce false negatives unrelated to the actual configuration.
   * `ok` reflects whether the effective URL is syntactically valid; the rest
   * are advisory warnings the admin can choose to ignore.
   */
  async checkNetworkConsistency(): Promise<NetworkCheckResult> {
    const cfg = await getOrCreate();
    const effectiveUrl = resolveEffectivePublicUrl(cfg.publicUrl);
    const warnings: string[] = [];

    let parsed: URL;
    try {
      parsed = new URL(effectiveUrl);
    } catch {
      return { ok: false, warnings: ['INVALID_URL'] };
    }

    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      warnings.push('NOT_HTTPS_IN_PRODUCTION');
    }

    return { ok: true, warnings };
  },

  async getHistory(limit = 50) {
    return prisma.configChangeLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true } } },
    });
  },

  async isSmtpEnabled(): Promise<boolean> {
    try {
      const cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
      return cfg?.smtpEnabled ?? false;
    } catch {
      return false;
    }
  },

  async updateRegistrationConfig(data: RegistrationConfig, userId: string): Promise<PublicSystemConfig> {
    await saveAndLog(userId, 'registration', data);
    return this.getPublic();
  },

  // #73: checked by authService.register once the instance's first account
  // (the admin, which bootstraps regardless) already exists.
  async isRegistrationOpen(): Promise<boolean> {
    const cfg = await getOrCreate();
    return cfg.registrationOpen;
  },
};
