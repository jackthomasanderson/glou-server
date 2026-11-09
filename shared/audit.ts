// #698: the audit log vocabulary, shared by api/ (what is written) and web/
// (the admin's action filter and its translated labels). Import only from shared/.

/** Every action the API writes to the audit log. */
export const AUDIT_ACTIONS = [
  'LIST', 'CREATE', 'READ', 'UPDATE', 'DELETE', 'RESTORE', 'RESTORE_FIELD',
  'LOGIN', 'LOGIN_2FA', 'LOGOUT', 'REGISTER',
  'CELLAR_CREATE', 'CELLAR_READ', 'CELLAR_UPDATE', 'CELLAR_DELETE', 'CELLAR_SWAP_SLOTS',
  'COLLECTION_CREATE', 'COLLECTION_UPDATE', 'COLLECTION_DELETE',
  'SESSION_REVOKE', 'TRUST_DEVICE', 'UNTRUST_DEVICE', 'BACKUP_CODES_REGENERATE', 'PIN_SET', 'PIN_REMOVE',
  'ADMIN_ROLE_CHANGE', 'ADMIN_STATUS_CHANGE', 'ADMIN_SHARE_REVOKE',
  'GUEST_UPDATE', 'GUEST_TASTING',
  'ONBOARDING_COMPLETE', 'IMPORT_CSV', 'SCAN', 'HUMIDOR_READING_CREATE',
  'ADD_UNITS', 'CORRECT_QUANTITY', 'MERGE_PRODUCTS', 'DISTINGUISH_PRODUCTS', 'REVIEW_OK', 'MOVE_UNITS', 'REPRICE_UNITS',
  'BACKUP_RESTORE', 'BACKUP_DOWNLOAD', 'PURGE', 'CONFIG_UPDATE', 'CONFIG_TEST',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** How an audited request ended. */
export const AUDIT_STATUSES = ['success', 'error', 'validation_error', 'not_found'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
