// Ceiling of the baseline per-address limiters on /api and /uploads, in
// requests per 15-minute window. API_RATE_LIMIT_MAX overrides it, e.g. on the
// E2E stack, where a whole Playwright suite comes from a single address. The
// stricter sign-in, password-reset, guest-link and scan limiters ignore it.

export const DEFAULT_API_RATE_LIMIT_MAX = 1000;

/** Unset or empty → default; anything but a positive whole number → default, with a warning. */
export function apiRateLimitMax(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.API_RATE_LIMIT_MAX?.trim();
  if (!raw) return DEFAULT_API_RATE_LIMIT_MAX;

  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (Number.isSafeInteger(value) && value > 0) return value;

  console.warn(
    `[config] API_RATE_LIMIT_MAX="${raw}" is not a positive whole number; using the default (${DEFAULT_API_RATE_LIMIT_MAX}).`,
  );
  return DEFAULT_API_RATE_LIMIT_MAX;
}
