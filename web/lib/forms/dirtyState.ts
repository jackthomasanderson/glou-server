/**
 * Dirty-state detection for the modal forms (ISSUE_119).
 *
 * The inventory, cellar and wishlist forms keep their values in plain
 * `useState` objects rather than in react-hook-form, so they have no
 * `formState.isDirty` to rely on. This module provides the equivalent
 * signal: a structural comparison between the snapshot taken when the
 * form was opened and the values currently held.
 *
 * Empty-ish values (`undefined`, `null`, `''`, `[]`) are treated as
 * equivalent so that a field the user never touched is not reported as a
 * change just because the baseline omitted the key entirely.
 */

function isEmptyValue(value: unknown): boolean {
  return (
    value === null
    || value === undefined
    || value === ''
    || (Array.isArray(value) && value.length === 0)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural comparison, tolerant to the empty-value aliases above. */
export function areValuesEquivalent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (isEmptyValue(a) && isEmptyValue(b)) return true;

  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => areValuesEquivalent(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!areValuesEquivalent(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * True when `current` differs from the `baseline` captured when the form
 * was opened, i.e. the user would lose something by closing now.
 */
export function isFormDirty(baseline: unknown, current: unknown): boolean {
  return !areValuesEquivalent(baseline, current);
}

/** Order-insensitive comparison, for multi-select fields holding ids. */
export function haveSameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
}
