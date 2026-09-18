// Gotify only accepts notifications on `/message`; users typically paste the
// bare server address. Append the path when the URL has none.
export function normalizeGotifyUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/message';
    }
    return url.toString();
  } catch {
    return raw;
  }
}
