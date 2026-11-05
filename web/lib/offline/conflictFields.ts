// ─── #585 — rows of the offline sync conflict dialog ───────────────────────
// A change queued from the edit form carries the whole record, so listing
// every key of the patch showed some fifty rows, almost all identical on both
// sides, plus technical ones (ids, dates, JSON). Only the fields whose value
// really differs between the queued change and the server are kept.

/** Bookkeeping fields: never something the member chose to change. */
const TECHNICAL_FIELDS = new Set([
  'id',
  'userId',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'fieldSources',
  'updatedBy',
  'collections',
  'expectedUpdatedAt',
  'lockedFields',
  'alertStatus',
  'readiness',
  '_creator',
  '_lastEditor',
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

export interface ConflictField {
  /** Path of the field in the change, `product.region` for a nested one. */
  path: string;
  /** Last segment of the path: the field whose label and format apply. */
  field: string;
  local: unknown;
  server: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Comparable form of a value: empty values are alike, dates compare by
 * instant, numbers sent as text compare as numbers. */
function normalize(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) {
      const time = new Date(value).getTime();
      if (!Number.isNaN(time)) return `date:${time}`;
    }
    const trimmed = value.trim();
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    return value;
  }
  if (Array.isArray(value)) return value.length === 0 ? null : value.map(normalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, normalize(value[k])]));
  }
  return value;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/**
 * Fields of a queued change that differ from the server's version of the
 * item, technical fields excluded. A nested group of fields (e.g. the wine
 * description moving to a `product` shared by a family of bottles) is
 * compared field by field, so its rows read like the others.
 */
export function conflictingFields(
  patch: Record<string, unknown>,
  serverItem: Record<string, unknown> | undefined,
  prefix = '',
): ConflictField[] {
  const rows: ConflictField[] = [];
  for (const [field, local] of Object.entries(patch)) {
    if (TECHNICAL_FIELDS.has(field)) continue;
    const server = serverItem?.[field];
    if (isPlainObject(local)) {
      rows.push(...conflictingFields(local, isPlainObject(server) ? server : undefined, `${prefix}${field}.`));
      continue;
    }
    if (sameValue(local, server)) continue;
    rows.push({ path: `${prefix}${field}`, field, local, server });
  }
  return rows;
}
