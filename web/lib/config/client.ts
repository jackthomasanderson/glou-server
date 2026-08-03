import { client } from '@/lib/api';

export interface SystemConfigPublic {
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
  publicUrl: string | null;
  accessMode: string;
  effectivePublicUrl: string;
  backupEnabled: boolean;
  backupRetentionDays: number;
  backupHourUtc: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface RetentionConfig {
  logRetentionDays: number;
  sessionRetentionDays: number;
  guestShareRetentionDays: number;
}

export interface NetworkConfig {
  publicUrl: string | null;
  accessMode: 'direct' | 'proxy';
}

export interface NetworkCheckResult {
  ok: boolean;
  warnings: string[];
}

// ─── FEAT-18: Scheduled Backups ───────────────────────────────────────────────

export interface BackupConfig {
  backupEnabled: boolean;
  backupRetentionDays: number;
  backupHourUtc: number;
}

export interface BackupRunEntry {
  id: string;
  runAt: string;
  trigger: 'scheduled' | 'manual';
  triggeredBy: string | null;
  success: boolean;
  filePath: string | null;
  fileSizeBytes: number | null;
  error: string | null;
  durationMs: number | null;
}

export interface MaintenanceRunCounts {
  auditLogs: number;
  sessions: number;
  trustedDevices: number;
  guestShares: number;
}

export interface MaintenanceRunEntry {
  id: string;
  runAt: string;
  trigger: 'scheduled' | 'manual';
  triggeredBy: string | null;
  success: boolean;
  counts: MaintenanceRunCounts | null;
  error: string | null;
  durationMs: number | null;
}

export interface NotificationPrefs {
  notifInApp: boolean;
  notifEmail: boolean;
  notifWebhook: boolean;
  notifCategories: string[];
  notifQuietStart: number | null;
  notifQuietEnd: number | null;
  notifLanguage: string | null;
  webhookUrl: string | null;
  policy: {
    smtpEnabled: boolean;
    gotifyEnabled: boolean;
    inAppEnabled: boolean;
  };
}

export interface ConfigHistoryEntry {
  id: number;
  fieldName: string;
  maskedNewVal: string | null;
  createdAt: string;
  user?: { username: string };
}

export const configClient = {
  async getConfig(): Promise<SystemConfigPublic> {
    const { data } = await client.get<SystemConfigPublic>('/admin/config');
    return data;
  },

  async updateSmtp(payload: Record<string, unknown>): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/smtp', payload);
    return data;
  },

  async updateGotify(payload: Record<string, unknown>): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/gotify', payload);
    return data;
  },

  async updateNotifPolicy(payload: { smtpEnabled: boolean; gotifyEnabled: boolean; inAppEnabled: boolean }): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/notifications', payload);
    return data;
  },

  async updateIntegrations(payload: Record<string, unknown>): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/integrations', payload);
    return data;
  },

  async updateRetention(payload: RetentionConfig): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/retention', payload);
    return data;
  },

  async updateNetwork(payload: NetworkConfig): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/network', payload);
    return data;
  },

  async checkNetwork(): Promise<NetworkCheckResult> {
    const { data } = await client.post<NetworkCheckResult>('/admin/config/network/check', {});
    return data;
  },

  async getMaintenanceRuns(): Promise<MaintenanceRunEntry[]> {
    const { data } = await client.get<MaintenanceRunEntry[]>('/admin/maintenance/runs');
    return data;
  },

  async runMaintenanceNow(): Promise<MaintenanceRunEntry> {
    const { data } = await client.post<MaintenanceRunEntry>('/admin/maintenance/run', {});
    return data;
  },

  async testSmtp(email?: string): Promise<{ success: boolean; error?: string }> {
    const { data } = await client.post<{ success: boolean; error?: string }>('/admin/config/test/smtp', { email });
    return data;
  },

  async testGotify(): Promise<{ success: boolean; error?: string }> {
    const { data } = await client.post<{ success: boolean; error?: string }>('/admin/config/test/gotify', {});
    return data;
  },

  async getHistory(): Promise<ConfigHistoryEntry[]> {
    const { data } = await client.get<ConfigHistoryEntry[]>('/admin/config/history');
    return data;
  },

  async updateBackupConfig(payload: BackupConfig): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/backup', payload);
    return data;
  },

  async getBackupRuns(): Promise<BackupRunEntry[]> {
    const { data } = await client.get<BackupRunEntry[]>('/admin/backups/runs');
    return data;
  },

  async runBackupNow(): Promise<BackupRunEntry> {
    const { data } = await client.post<BackupRunEntry>('/admin/backups/run', {});
    return data;
  },

  async restoreBackup(id: string): Promise<void> {
    await client.post(`/admin/backups/${id}/restore`, { confirm: true });
  },

  getBackupDownloadUrl(id: string): string {
    return `/api/admin/backups/${id}/download`;
  },

  async getNotifPrefs(): Promise<NotificationPrefs> {
    const { data } = await client.get<NotificationPrefs>('/user/notifications');
    return data;
  },

  async updateNotifPrefs(payload: Partial<NotificationPrefs>): Promise<void> {
    await client.patch('/user/notifications', payload);
  },

  async testNotifChannel(channel: 'email' | 'webhook'): Promise<{ success: boolean; error?: string }> {
    const { data } = await client.post<{ success: boolean; error?: string }>(`/user/notifications/test/${channel}`, {});
    return data;
  },

  async getSmtpStatus(): Promise<{ smtpEnabled: boolean }> {
    const { data } = await client.get<{ smtpEnabled: boolean }>('/auth/smtp-status');
    return data;
  },

  async forgotPassword(email: string): Promise<void> {
    await client.post('/auth/forgot-password', { email });
  },

  async validateResetToken(token: string): Promise<{ valid: boolean }> {
    const { data } = await client.post<{ valid: boolean }>('/auth/validate-reset-token', { token });
    return data;
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await client.post('/auth/reset-password', { token, newPassword });
  },
};
