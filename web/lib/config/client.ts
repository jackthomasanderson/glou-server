import { client } from '@/lib/api';
import type { BackupHealth } from '@shared/maintenance';
import type { NotificationCategory, NotificationChannelPolicy } from '@shared/notifications';

/**
 * A restore takes a safety backup, then replays a whole dump (#666): far more
 * than the usual 15 s. The browser still gives up just before the /api proxy
 * (proxyTimeout in next.config.mjs), so the dialog can say the restore goes on
 * on the server instead of showing the proxy's error.
 */
export const RESTORE_TIMEOUT_MS = 75_000;

/**
 * #748: a manual backup of a large cellar, or one queued behind a running
 * restore (they share a lock), can outlast the usual 15 s as well.
 */
export const RUN_BACKUP_TIMEOUT_MS = RESTORE_TIMEOUT_MS;

/**
 * #890: the admin's own password, plus their code when they have 2FA, sent
 * with the settings and backup actions a stolen session could misuse.
 */
export interface AdminReauth {
  password: string;
  code?: string;
}

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
  logRetentionDays: number;
  sessionRetentionDays: number;
  guestShareRetentionDays: number;
  publicUrl: string | null;
  effectivePublicUrl: string;
  registrationOpen: boolean;
  backupEnabled: boolean;
  backupRetentionDays: number;
  /** #761: an hour of `timeZone`. */
  backupHour: number;
  /** #761: the server's time zone (`TZ`), in which every scheduled job runs. */
  timeZone: string;
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
}

export interface NetworkCheckResult {
  ok: boolean;
  warnings: string[];
}

// #73: close registrations by default
export interface RegistrationConfig {
  registrationOpen: boolean;
}

// ─── FEAT-18: Scheduled Backups ───────────────────────────────────────────────

export interface BackupConfig {
  backupEnabled: boolean;
  backupRetentionDays: number;
  backupHour: number;
}

export interface BackupRunEntry {
  id: string;
  runAt: string;
  trigger: 'scheduled' | 'manual';
  userId: string | null;
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
  userId: string | null;
  success: boolean;
  counts: MaintenanceRunCounts | null;
  error: string | null;
  durationMs: number | null;
}

export interface NotificationPrefs {
  notifEmail: boolean;
  notifWebhook: boolean;
  notifCategories: string[];
  notifQuietStart: number | null;
  notifQuietEnd: number | null;
  notifLanguage: string | null;
  /** #767: the member only opts in to Gotify; messages go to the instance's server. */
  policy: NotificationChannelPolicy;
  /** #780: the categories this member can receive (backup failures: admins only). */
  categories: NotificationCategory[];
  /** #780: admins only — whether automatic backups run. */
  automaticBackups?: boolean;
  /** #772: the instance time zone, in which quiet hours are read. */
  timeZone: string;
}

/** What the profile saves: its own settings, never the instance policy. */
export type NotificationPrefsPatch = Partial<Omit<NotificationPrefs, 'policy' | 'categories' | 'automaticBackups' | 'timeZone'>>;

export interface ConfigHistoryEntry {
  id: number;
  /** The settings section that was saved (`smtp`, `backup`, …). */
  fieldName: string;
  /**
   * #760: JSON objects keyed by setting, holding only what changed; secrets
   * are masked. Entries written before #760 have no old value and hold the
   * whole submitted form as their new value.
   */
  maskedOldVal: string | null;
  maskedNewVal: string | null;
  createdAt: string;
  user?: { username: string };
}

export const configClient = {
  async getConfig(): Promise<SystemConfigPublic> {
    const { data } = await client.get<SystemConfigPublic>('/admin/config');
    return data;
  },

  // ISSUE_169: what Admin → System Configuration → System reads to show a
  // version a bug reporter can copy, instead of the moving `latest`/`beta`
  // image tags the old bug report template used to ask for.
  // #625: it also gives the public URL bottle QR codes encode (null: none set).
  async getVersion(): Promise<{ version: string; publicUrl: string | null }> {
    const { data } = await client.get<{ version: string; publicUrl: string | null }>('/version');
    return data;
  },

  async updateSmtp(payload: Record<string, unknown>, reauth: AdminReauth): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/smtp', { ...payload, ...reauth });
    return data;
  },

  async updateGotify(payload: Record<string, unknown>, reauth: AdminReauth): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/gotify', { ...payload, ...reauth });
    return data;
  },

  // #893: lowering a retention, turning backups off or opening sign-up also
  // asks for the step-up (shared/admin-config.ts); `reauth` is sent then.
  async updateRetention(payload: RetentionConfig, reauth?: AdminReauth): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/retention', { ...payload, ...reauth });
    return data;
  },

  async updateNetwork(payload: NetworkConfig, reauth: AdminReauth): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/network', { ...payload, ...reauth });
    return data;
  },

  async checkNetwork(): Promise<NetworkCheckResult> {
    const { data } = await client.post<NetworkCheckResult>('/admin/config/network/check', {});
    return data;
  },

  async updateRegistration(payload: RegistrationConfig, reauth?: AdminReauth): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/registration', { ...payload, ...reauth });
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

  async testSmtp(email: string | undefined, reauth: AdminReauth): Promise<{ success: boolean; error?: string }> {
    const { data } = await client.post<{ success: boolean; error?: string }>('/admin/config/test/smtp', { email, ...reauth });
    return data;
  },

  async testGotify(reauth: AdminReauth): Promise<{ success: boolean; error?: string }> {
    const { data } = await client.post<{ success: boolean; error?: string }>('/admin/config/test/gotify', reauth);
    return data;
  },

  async getHistory(): Promise<ConfigHistoryEntry[]> {
    const { data } = await client.get<ConfigHistoryEntry[]>('/admin/config/history');
    return data;
  },

  async updateBackupConfig(payload: BackupConfig, reauth?: AdminReauth): Promise<SystemConfigPublic> {
    const { data } = await client.put<SystemConfigPublic>('/admin/config/backup', { ...payload, ...reauth });
    return data;
  },

  async getBackupRuns(): Promise<BackupRunEntry[]> {
    const { data } = await client.get<BackupRunEntry[]>('/admin/backups/runs');
    return data;
  },

  async getBackupHealth(): Promise<BackupHealth> {
    const { data } = await client.get<BackupHealth>('/admin/backups/health');
    return data;
  },

  async runBackupNow(): Promise<BackupRunEntry> {
    const { data } = await client.post<BackupRunEntry>('/admin/backups/run', {}, { timeoutMs: RUN_BACKUP_TIMEOUT_MS });
    return data;
  },

  // #489 / #890: restore and download ask for the admin's password and code.
  async restoreBackup(id: string, reauth: AdminReauth): Promise<void> {
    await client.post(`/admin/backups/${id}/restore`, { confirm: true, ...reauth }, { timeoutMs: RESTORE_TIMEOUT_MS });
  },

  /** POST (password and code in the body), returned as a file to save. */
  async downloadBackup(id: string, reauth: AdminReauth): Promise<{ blob: Blob; filename: string }> {
    const { blob, headers } = await client.blob(`/admin/backups/${id}/download`, { method: 'POST', body: reauth });
    const disposition = headers.get('Content-Disposition') ?? '';
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'glou-backup.sql.gz';
    return { blob, filename };
  },

  async getNotifPrefs(): Promise<NotificationPrefs> {
    const { data } = await client.get<NotificationPrefs>('/user/notifications');
    return data;
  },

  async updateNotifPrefs(payload: NotificationPrefsPatch): Promise<void> {
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

  async getRegistrationStatus(): Promise<{ registrationOpen: boolean }> {
    const { data } = await client.get<{ registrationOpen: boolean }>('/auth/registration-status');
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
