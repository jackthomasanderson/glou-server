// Whether auth cookies carry the `Secure` flag. A browser silently drops a
// `Secure` cookie received over plain HTTP, so the previous rule
// (NODE_ENV === 'production') made sign-in fail to stick on an instance served
// over http://<nas-ip>:3000, which is the default Docker/NAS setup (#213).
//
//   COOKIE_SECURE=true|false  explicit override (e.g. TLS terminated upstream
//                             while APP_URL still says http)
//   otherwise                 Secure only when APP_URL is an https:// URL
//   APP_URL unset             falls back to the old NODE_ENV rule

export function isCookieSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  const override = env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;

  const appUrl = env.APP_URL?.trim();
  if (appUrl) return appUrl.toLowerCase().startsWith('https://');

  return env.NODE_ENV === 'production';
}
