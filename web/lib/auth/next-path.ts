/**
 * #507: where to go after signing in. AuthGuard sends a signed-out visitor
 * to `/login?next=<the page they asked for>` (a bottle QR code, an emailed
 * link, a bookmark), and sign-in / 2FA return there.
 *
 * Only same-origin paths are accepted, otherwise the login page would become
 * an open redirect (#602). Comparing prefixes is not enough: browsers drop
 * tabs and newlines from a URL, read `\` as `/` and resolve `..`, so
 * "/\t/evil.example", "/\evil.example" and "/..//evil.example" all end up as
 * "//evil.example", another host. The value is parsed the way the browser will
 * read it, and only its normalised path is kept, if it stays on this origin.
 */
export const DEFAULT_LANDING = '/bottles';

// Stand-in origin for the parse: only "does it leave the origin" matters, and
// a fixed one gives the same answer on the server and in every test.
const BASE = 'https://next-path.invalid';

/** C0 control characters and DEL: browsers strip or reject them in URLs. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function sameOriginPath(value: string): URL | null {
  try {
    const url = new URL(value, BASE);
    return url.origin === BASE ? url : null;
  } catch {
    return null;
  }
}

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  // Before `?`/`#`, where the host could be smuggled in, a raw control
  // character or backslash only comes from a crafted link. After them,
  // browsers keep `\` as typed in `location.search` and `location.hash`.
  const pathPart = raw.split(/[?#]/, 1)[0];
  if (hasControlChar(pathPart) || pathPart.includes('\\')) return null;
  const url = sameOriginPath(raw);
  if (!url) return null;
  const path = url.pathname + url.search + url.hash;
  // `..` resolution can turn "/..//evil.example" into "//evil.example".
  if (path.startsWith('//') || !sameOriginPath(path)) return null;
  if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return null;
  return path;
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
