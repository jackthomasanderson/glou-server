// #893: admin settings changes that erase data or weaken the instance. Each one
// asks for the admin's step-up (password, plus their code with 2FA), like the
// settings of #890; the opposite direction of the same setting does not. The
// API enforces these rules, the web uses them to open the step-up dialog
// before saving. Import only from shared/.

export interface RetentionSettings {
  logRetentionDays: number;
  sessionRetentionDays: number;
  guestShareRetentionDays: number;
}

export interface BackupSettings {
  backupEnabled: boolean;
  backupRetentionDays: number;
}

/** Any retention window shortened: the next cleanup erases what it no longer keeps (the audit log included). */
export function lowersRetention(current: RetentionSettings, next: RetentionSettings): boolean {
  return next.logRetentionDays < current.logRetentionDays
    || next.sessionRetentionDays < current.sessionRetentionDays
    || next.guestShareRetentionDays < current.guestShareRetentionDays;
}

/** Scheduled backups turned off, or their files kept for fewer days (older ones are deleted at the next backup). */
export function weakensBackups(current: BackupSettings, next: BackupSettings): boolean {
  return (current.backupEnabled && !next.backupEnabled) || next.backupRetentionDays < current.backupRetentionDays;
}

/** Sign-up opened to anyone. */
export function opensRegistration(current: { registrationOpen: boolean }, next: { registrationOpen: boolean }): boolean {
  return !current.registrationOpen && next.registrationOpen;
}

/**
 * #924: how the SMTP connection is encrypted. TLS from the first byte (port
 * 465); STARTTLS required, never a fall-back to clear text (port 587); or no
 * encryption at all, for a trusted relay on the local network.
 */
export const SMTP_SECURITY_MODES = ['TLS', 'STARTTLS', 'NONE'] as const;
export type SmtpSecurity = (typeof SMTP_SECURITY_MODES)[number];
