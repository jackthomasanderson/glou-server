/**
 * Notification language resolution: a user's `notifLanguage` (when set)
 * takes precedence over their interface `language` (#406), matching the
 * pattern already followed in `auth.service.ts`, `humidor.service.ts` and
 * `wishlist.service.ts`.
 */
export function isNotifEn(user: { language: string; notifLanguage?: string | null }): boolean {
  return (user.notifLanguage ?? user.language) === 'EN';
}
