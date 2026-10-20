/**
 * #507: where to go after signing in. AuthGuard sends a signed-out visitor
 * to `/login?next=<the page they asked for>` (a bottle QR code, an emailed
 * link, a bookmark), and sign-in / 2FA return there.
 *
 * Only same-origin paths are accepted: "/bottles?scan=1" yes, "//evil.example"
 * or "/\evil.example" (both read as another host by browsers) no — otherwise
 * the login page would become an open redirect.
 */
export const DEFAULT_LANDING = '/bottles';

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/login/')) return null;
  return raw;
}

/** `/login`, or `/login?next=…` when the current page is worth coming back to. */
export function loginPathFor(current: string): string {
  const next = safeNextPath(current);
  if (!next || next === '/' || next === DEFAULT_LANDING) return '/login';
  return `/login?next=${encodeURIComponent(next)}`;
}

/** The destination after a successful sign-in, read from the login page URL. */
export function postLoginPath(search: string): string {
  return safeNextPath(new URLSearchParams(search).get('next')) ?? DEFAULT_LANDING;
}
