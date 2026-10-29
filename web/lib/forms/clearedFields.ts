/**
 * A field the user empties holds `undefined` in a form, and `JSON.stringify`
 * drops undefined keys: the PATCH never mentioned the field and the server
 * kept the old value (#726). Emptying the vintage, a price or a colour of an
 * existing bottle saved without error and changed nothing.
 *
 * For an edit, a field that had a value and is now `undefined` is sent as
 * `null`, which clears it. A field that was already empty is left out.
 */
export function withClearedFields<T extends object>(initial: object | undefined, values: T): T {
  if (!initial) return values;
  const before = initial as Record<string, unknown>;
  const out = { ...values } as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined && before[key] != null) out[key] = null;
  }
  return out as T;
}
