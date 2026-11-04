import { glouKey, safeReadStorage, safeRemoveStorage, safeWriteStorage } from '../safe-storage';

/**
 * ux-ui.md §10.7, decision #471 (QP5): "Plus tard" hides the banner "N points
 * à vérifier" until the next sign-in, as long as points are left. Kept in the
 * browser across tabs and reloads; every sign-in and sign-out clears it.
 */
const REVIEW_BANNER_KEY = glouKey('review-banner-later');

export function isReviewBannerPostponed(): boolean {
  return safeReadStorage('local', REVIEW_BANNER_KEY) === '1';
}

export function postponeReviewBanner(): void {
  safeWriteStorage('local', REVIEW_BANNER_KEY, '1');
}

/** A new sign-in (or a sign-out): the banner comes back while points are left. */
export function resetReviewBanner(): void {
  safeRemoveStorage('local', REVIEW_BANNER_KEY);
}
