import { InventoryItem } from './types';

export function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function vintageMatch(a: number | null | undefined, b: number | null | undefined): boolean {
  // If either side has no vintage, treat as potential match and let the user decide
  if (a == null || b == null) return true;
  return a === b;
}

/**
 * Pure comparator (FEAT-65 dedup rules) — true if `a` and `b` would be
 * considered the same inventory entry. Extracted out of `findDuplicate` so
 * the scan flow (FEAT-04) can also check a scanned candidate against
 * in-memory items (e.g. one just created earlier in the same scan session)
 * without duplicating the matching rules.
 */
export function isDuplicateOf(a: Partial<InventoryItem>, b: Partial<InventoryItem>): boolean {
  if (!a.category || !b.category || a.category !== b.category) return false;
  if (!a.producer || !b.producer || normalize(a.producer) !== normalize(b.producer)) return false;
  if (!a.name || !b.name || normalize(a.name) !== normalize(b.name)) return false;

  if (a.category === 'cigar') {
    return normalize(a.format) === normalize(b.format);
  }

  if (a.category === 'spirit') {
    return normalize(a.bottleSize) === normalize(b.bottleSize);
  }

  // wine / sparkling
  return vintageMatch(a.vintage, b.vintage) && normalize(a.bottleSize) === normalize(b.bottleSize);
}

export function findDuplicate(
  items: InventoryItem[],
  candidate: Partial<InventoryItem>
): InventoryItem | null {
  if (!candidate.category || !candidate.producer || !candidate.name) return null;
  return items.find((item) => isDuplicateOf(item, candidate)) ?? null;
}
