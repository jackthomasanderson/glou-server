import type { CellarType, GridItem } from './types';

/** i18next options that pick a key's cigar or mixed variant (`…_cigar`, `…_mixed`), or nothing. */
export type GridWording = { context?: 'cigar' | 'mixed' };

/**
 * #471 (recette v2): the plan of a humidor, or of a cellar that only holds
 * cigars, speaks of cigars and boxes rather than bottles ("Assign a cigar or
 * a box…"). Empty for any other cellar, so the default (bottle) wording stays.
 */
export function gridWording(cellarType: CellarType | undefined, items: readonly Pick<GridItem, 'category'>[]): GridWording {
  const cigars = items.some((item) => item.category === 'cigar');
  const others = items.some((item) => item.category !== 'cigar');
  // Recette v3: a cellar holding both speaks of both ("une bouteille, une boîte ou un cigare").
  if (cigars && others) return { context: 'mixed' };
  return cellarType === 'HUMIDOR' || cigars ? { context: 'cigar' } : {};
}
