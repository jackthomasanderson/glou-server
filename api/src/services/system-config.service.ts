import { prisma } from '../lib/prisma';
import { encrypt, decrypt, maskSecret } from '../lib/crypto';
import { SystemConfig } from '@prisma/client';

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

export interface IntegrationsConfig {
  vivinoKey: string | null; // plaintext
  whiskybaseKey: string | null; // plaintext
  ocrUrl: string | null;
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
  vivinoKeyMasked: string | null;
  whiskybaseKeyMasked: string | null;
  ocrUrl: string | null;
  logRetentionDays: number;
  sessionRetentionDays: number;
  guestShareRetentionDays: number;
  updatedAt: Date | null;
  updatedBy: string | null;
};

async function getOrCreate(): Promise<SystemConfig> {
  let config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  if (!config) {
    config = await prisma.systemConfig.create({ data: { id: 'singleton' } });
  }
  return config;
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
      vivinoKeyMasked: maskSecret(cfg.vivinoKeyEnc),
      whiskybaseKeyMasked: maskSecret(cfg.whiskybaseKeyEnc),
      ocrUrl: cfg.ocrUrl,
      logRetentionDays: cfg.logRetentionDays,
      sessionRetentionDays: cfg.sessionRetentionDays,
      guestShareRetentionDays: cfg.guestShareRetentionDays,
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
    const old = await getOrCreate();
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

    await prisma.systemConfig.update({ where: { id: 'singleton' }, data: update });
    await this.logChange(userId, 'smtp', old, update);
    return this.getPublic();
  },

  async updateGotify(data: Partial<GotifyConfig & { gotifyToken?: string | null }>, userId: string): Promise<PublicSystemConfig> {
    const old = await getOrCreate();
    const update: Record<string, unknown> = { updatedBy: userId };

    if (data.gotifyEnabled !== undefined) update.gotifyEnabled = data.gotifyEnabled;
    if (data.gotifyUrl !== undefined) update.gotifyUrl = data.gotifyUrl;
    if (data.gotifyToken !== undefined) {
      update.gotifyTokenEnc = data.gotifyToken ? encrypt(data.gotifyToken) : null;
    }

    await prisma.systemConfig.update({ where: { id: 'singleton' }, data: update });
    await this.logChange(userId, 'gotify', old, update);
    return this.getPublic();
  },

  async updateNotificationPolicy(data: NotificationPolicyConfig, userId: string): Promise<PublicSystemConfig> {
    const old = await getOrCreate();
    const update = { ...data, updatedBy: userId };
    await prisma.systemConfig.update({ where: { id: 'singleton' }, data: update });
    await this.logChange(userId, 'notifications', old, data);
    return this.getPublic();
  },

  async updateIntegrations(data: IntegrationsConfig, userId: string): Promise<PublicSystemConfig> {
    const old = await getOrCreate();
    const update: Record<string, unknown> = { updatedBy: userId };

    if (data.vivinoKey !== undefined) update.vivinoKeyEnc = data.vivinoKey ? encrypt(data.vivinoKey) : null;
    if (data.whiskybaseKey !== undefined) update.whiskybaseKeyEnc = data.whiskybaseKey ? encrypt(data.whiskybaseKey) : null;
    if (data.ocrUrl !== undefined) update.ocrUrl = data.ocrUrl;

    await prisma.systemConfig.update({ where: { id: 'singleton' }, data: update });
    await this.logChange(userId, 'integrations', old, update);
    return this.getPublic();
  },

  async updateRetention(data: RetentionConfig, userId: string): Promise<PublicSystemConfig> {
    const old = await getOrCreate();
    const update = { ...data, updatedBy: userId };
    await prisma.systemConfig.update({ where: { id: 'singleton' }, data: update });
    await this.logChange(userId, 'retention', old, data);
    return this.getPublic();
  },

  async getHistory(limit = 50) {
    return prisma.configChangeLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true } } },
    });
  },

  async logChange(userId: string, section: string, _old: SystemConfig, _new: Record<string, unknown>) {
    await prisma.configChangeLog.create({
      data: {
        userId,
        fieldName: section,
        maskedOldVal: null,
        maskedNewVal: JSON.stringify(
          Object.fromEntries(
            Object.entries(_new)
              .filter(([k]) => k !== 'updatedBy')
              .map(([k, v]) => [k, k.endsWith('Enc') ? '••••••••' : v])
          )
        ),
      },
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
};
