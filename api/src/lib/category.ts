import { BottleCategory } from '@prisma/client';
import { z } from 'zod';
import type { InventoryCategory } from '../../../shared/inventory';

// ISSUE_137: the wine/sparkling/spirit/cigar category list was hand-copied
// into 9 independent `z.enum([...])` calls across api/src — adding a
// category meant remembering every one of them. Prisma's `BottleCategory`
// enum (schema.prisma) is the single source of truth; every schema that
// validates a category derives from it instead.
export const CATEGORY_VALUES = Object.values(BottleCategory) as [BottleCategory, ...BottleCategory[]];

export const categorySchema = z.enum(CATEGORY_VALUES);

/** Lower case, no accents, no spaces/punctuation: "Millésime" → "millesime", "Rosé" → "rose". */
export function normalizeToken(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]/g, '');
}

// #596: the label scan and the CSV import each had their own list of
// category words (#510), and they disagreed ("Rouge" only in the scan,
// "Bulles" only in the import). One list, read through normalizeToken, for
// both: French and English names, singular or plural, a colour, a few
// common types.
const CATEGORY_ALIASES: Record<string, InventoryCategory> = {
  wine: 'wine', wines: 'wine', vin: 'wine', vins: 'wine',
  red: 'wine', white: 'wine', rouge: 'wine', blanc: 'wine', rose: 'wine',
  sparkling: 'sparkling', bulles: 'sparkling', bulle: 'sparkling', champagne: 'sparkling', cremant: 'sparkling',
  mousseux: 'sparkling', effervescent: 'sparkling', prosecco: 'sparkling', cava: 'sparkling',
  spirit: 'spirit', spirits: 'spirit', spiritueux: 'spirit', whisky: 'spirit', whiskey: 'spirit', rhum: 'spirit',
  rum: 'spirit', cognac: 'spirit', armagnac: 'spirit', calvados: 'spirit', gin: 'spirit', vodka: 'spirit',
  cigar: 'cigar', cigars: 'cigar', cigare: 'cigar', cigares: 'cigar',
};

/** The category a word names ("Rouge", "Bulles", "Spiritueux"…), null when none. */
export function toCategory(raw: string): InventoryCategory | null {
  return CATEGORY_ALIASES[normalizeToken(raw)] ?? null;
}
