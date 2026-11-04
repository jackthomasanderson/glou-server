type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * #471 (FEAT-109, decision #471 point 64): who noted a tasting through a
 * guest link — "Marie (invité)", or "Invité" when the share named nobody.
 * Null for a member's tasting (`guestName` null).
 */
export function guestSignature(guestName: string | null | undefined, t: Translate): string | null {
  if (guestName == null) return null;
  const name = guestName.trim();
  return name ? t('shares.guest.signature.named', { name }) : t('shares.guest.signature.anonymous');
}
