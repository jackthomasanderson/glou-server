import { InventoryItem } from './types';

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function vintageMatch(a: number | null | undefined, b: number | null | undefined): boolean {
  // If either side has no vintage, treat as potential match and let the user decide
  if (a == null || b == null) return true;
  return a === b;
}

export function findDuplicate(
  items: InventoryItem[],
  candidate: Partial<InventoryItem>
): InventoryItem | null {
  if (!candidate.category || !candidate.producer || !candidate.name) return null;

  return (
    items.find((item) => {
      if (item.category !== candidate.category) return false;
      if (normalize(item.producer) !== normalize(candidate.producer)) return false;
      if (normalize(item.name) !== normalize(candidate.name)) return false;

      if (candidate.category === 'cigar') {
        return normalize(item.format) === normalize(candidate.format);
      }

      if (candidate.category === 'spirit') {
        return normalize(item.bottleSize) === normalize(candidate.bottleSize);
      }

      // wine / sparkling
      return (
        vintageMatch(item.vintage, candidate.vintage) &&
        normalize(item.bottleSize) === normalize(candidate.bottleSize)
      );
    }) ?? null
  );
}
