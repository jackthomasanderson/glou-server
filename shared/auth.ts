// #466: account contracts shared by api/ and web/. Import only from shared/.

/** Minimum password length: enforced by the API, shown by every web form (sign-up, change, reset). */
export const PASSWORD_MIN_LENGTH = 12;

/** #222/#509: days between a deletion request and the automatic anonymisation of the account. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

// Same values as the Prisma enums of the same name (api/prisma/schema.prisma);
// api/tests/contracts/shared-contracts.test.ts fails if they drift apart.
export type Theme = 'LIGHT' | 'DARK' | 'SYSTEM';
export type Language = 'FR' | 'EN';
export type TempUnit = 'CELSIUS' | 'FAHRENHEIT';
export type DateFormat = 'SYSTEM' | 'H24' | 'H12';

/** FEAT-18/38: data a member can include in their GDPR export, in display order. */
export const EXPORT_CATEGORIES = [
  'inventory', 'cellars', 'collections', 'tastings', 'activity',
  'wishlist', 'budget', 'goals', 'counts', 'humidor',
  'sessions', 'devices', 'notifications', 'configHistory',
] as const;
export type ExportCategory = (typeof EXPORT_CATEGORIES)[number];

/** The signed-in member, as GET /api/user/me and every profile update return it. */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  appName: string | null;
  appSlogan: string | null;
  displayName: string | null;
  theme: Theme;
  language: Language;
  tempUnit: TempUnit;
  accentColor: string;
  dateFormat: DateFormat;
  /** "Mode expert / collectionneur": reveals the advanced sections. */
  expertMode: boolean;
  isAdmin: boolean;
  createdAt: Date;
  deletionRequestedAt: Date | null;
  /** FEAT-30: a quick-lock PIN is set (its hash never leaves the API). */
  hasPin: boolean;
  autoLockDelayMin: number | null;
  /** FEAT-56: null until the onboarding wizard is completed or skipped. */
  onboardingCompletedAt: Date | null;
  /** #336: set by an administrator's no-SMTP reset; the web blocks the app until the password is changed. */
  mustChangePassword: boolean;
  /** #576: drives the 2FA panel and the trust-this-device prompt. */
  isTwoFactorEnabled: boolean;
}
