/**
 * Express 5 (`@types/express` 5) widened `req.params` / `req.query` values to
 * `string | string[]` (a repeated key yields an array). These helpers collapse
 * a value back to a single string, keeping the first entry of a repeated key —
 * identical to the pre-v5 behaviour where only the first value was surfaced.
 */

/** First string value of a params/query entry, or `undefined` if there is none. */
export const firstStr = (v: unknown): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s : undefined;
};

/** Route param as a plain string. Path params are always present at runtime, so
 *  this never returns `undefined` (falls back to `''`). */
export const routeParam = (v: unknown): string => firstStr(v) ?? '';
