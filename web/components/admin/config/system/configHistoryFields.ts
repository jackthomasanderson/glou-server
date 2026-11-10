/**
 * #760: how the configuration history names and shows each setting.
 *
 * One row per field name the API records (the `SystemConfig` column). Its
 * label is `adminConfig.history.fields.<field>` and its section title
 * `adminConfig.history.sections.<section>`, in both locale files. When a
 * setting is added, add it here and to the locales; when one is removed, keep
 * its row so older entries still read well. A field missing from this table
 * still displays, under a generic label.
 */
export type HistoryFieldKind =
  | 'text'
  | 'number'
  | 'bool'
  | 'secret'
  | 'days'
  | 'hour'
  /** A fixed set of values, each translated as `adminConfig.history.values.<field>.<value>`. */
  | 'enum';

export const HISTORY_FIELDS: Record<string, HistoryFieldKind> = {
  // Email
  smtpEnabled: 'bool',
  smtpHost: 'text',
  smtpPort: 'number',
  smtpUser: 'text',
  smtpPassEnc: 'secret',
  smtpFrom: 'text',
  smtpSecure: 'bool',
  // Gotify
  gotifyEnabled: 'bool',
  gotifyUrl: 'text',
  gotifyTokenEnc: 'secret',
  // Retention
  logRetentionDays: 'days',
  sessionRetentionDays: 'days',
  guestShareRetentionDays: 'days',
  // Backups
  backupEnabled: 'bool',
  backupRetentionDays: 'days',
  backupHour: 'hour',
  // Network
  publicUrl: 'text',
  // Sign-up
  registrationOpen: 'bool',
  // Removed settings, kept for older entries
  inAppEnabled: 'bool', // the in-app channel, before #671
  backupHourUtc: 'hour', // a UTC hour, before #761
  accessMode: 'enum',
  vivinoKeyEnc: 'secret',
  whiskybaseKeyEnc: 'secret',
};

/** Sections with a title in `adminConfig.history.sections`; any other reads as "Settings". */
export const HISTORY_SECTIONS = [
  'smtp', 'gotify', 'notifications', 'retention', 'backup', 'network', 'registration', 'integrations',
] as const;

/** A field the table does not know: a name ending in `Enc` is a secret, as on the API side. */
export function historyFieldKind(field: string): HistoryFieldKind | undefined {
  return HISTORY_FIELDS[field] ?? (field.endsWith('Enc') ? 'secret' : undefined);
}
