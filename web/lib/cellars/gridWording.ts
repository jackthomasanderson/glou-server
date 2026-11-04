import type { CellarType, GridItem } from './types';

/** i18next options that pick a key's cigar variant (`…_cigar`), or nothing. */
export type GridWording = { context?: 'cigar' };

/**
 * #471 (recette v2): the plan of a humidor, or of a cellar that only holds
 * cigars, speaks of cigars and boxes rather than bottles ("Assign a cigar or
 * a box…"). Empty for any other cellar, so the default (bottle) wording stays.
 */
export function gridWording(cellarType: CellarType | undefined, items: readonly Pick<GridItem, 'category'>[]): GridWording {
  const cigarsOnly = items.length > 0 && items.every((item) => item.category === 'cigar');
  return cellarType === 'HUMIDOR' || cigarsOnly ? { context: 'cigar' } : {};
}
