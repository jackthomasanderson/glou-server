// #698: the audit log vocabulary, shared by api/ (what is written) and web/
// (the admin's action filter and its translated labels). Import only from shared/.

/**
 * Every action the API writes to the audit log. #635: no read action (LIST,
 * READ, CELLAR_READ) — reads are not audited (#160), and leaving them out of
 * this list lets the compiler refuse a new one. Rows written before stay
 * labelled through the translation files until the 90-day retention drops them.
 */
export const AUDIT_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'RESTORE_FIELD',
  'LOGIN', 'LOGIN_2FA', 'LOGOUT', 'REGISTER',
  'CELLAR_CREATE', 'CELLAR_UPDATE', 'CELLAR_DELETE', 'CELLAR_SWAP_SLOTS',
  'COLLECTION_CREATE', 'COLLECTION_UPDATE', 'COLLECTION_DELETE',
  'SESSION_REVOKE', 'TRUST_DEVICE', 'UNTRUST_DEVICE', 'BACKUP_CODES_REGENERATE', 'PIN_SET', 'PIN_REMOVE',
  'ADMIN_ROLE_CHANGE', 'ADMIN_STATUS_CHANGE', 'ADMIN_SHARE_REVOKE',
  'GUEST_UPDATE', 'GUEST_TASTING',
  'ONBOARDING_COMPLETE', 'IMPORT_CSV', 'SCAN', 'HUMIDOR_READING_CREATE',
  'ADD_UNITS', 'CORRECT_QUANTITY', 'MERGE_PRODUCTS', 'DISTINGUISH_PRODUCTS', 'REVIEW_OK', 'MOVE_UNITS', 'REPRICE_UNITS',
  'BACKUP_RESTORE', 'BACKUP_DOWNLOAD', 'PURGE', 'CONFIG_UPDATE', 'CONFIG_TEST',
  // #601: the events that change who can get in.
  'LOGIN_FAILED', 'PASSWORD_CHANGE', 'EMAIL_CHANGE', 'USERNAME_CHANGE', 'TWO_FACTOR_ON', 'TWO_FACTOR_OFF', 'ADMIN_PASSWORD_RESET',
  'SHARE_CREATE', 'SHARE_REVOKE',
  // #962: an administrator deletes an entry of the trash, or empties it, for good.
  'TRASH_DELETE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** How an audited request ended. */
export const AUDIT_STATUSES = ['success', 'error', 'validation_error', 'not_found'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
