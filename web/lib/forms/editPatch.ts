import { areValuesEquivalent } from './dirtyState';
import { withClearedFields } from './clearedFields';

/**
 * The PATCH body of an edit form: only the fields the user changed (#572).
 *
 * The whole record used to be sent, which overwrote what someone else changed
 * while the form was open; and the API locks every field it receives and drops
 * its scan/import source, so one corrected price cost every provenance badge.
 *
 * A field left as it was, or changed and then put back, is left out. A field
 * the user emptied is sent as `null`, which clears it (#726).
 */
export function buildEditPatch<T extends object>(initial: object, values: T): Partial<T> {
  const before = initial as Record<string, unknown>;
  const changed = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !areValuesEquivalent(before[key], value)),
  ) as Partial<T>;
  return withClearedFields(initial, changed);
}
