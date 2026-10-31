import type { CellarStats } from '@shared/cellar';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * What a cellar holds, as its card says it (§10.6): "24 bouteilles · 50
 * cigares", only the kinds it holds; "0 bouteille" when it is empty. The
 * figures are units in stock (FEAT-96), never wines or lines.
 */
export function cellarContentsLabel(stats: Pick<CellarStats, 'bottles' | 'cigars'>, t: Translate): string {
  const parts: string[] = [];
  if (stats.bottles > 0 || stats.cigars === 0) parts.push(t('cellars.stats.bottlesCount', { count: stats.bottles }));
  if (stats.cigars > 0) parts.push(t('cellars.stats.cigarsCount', { count: stats.cigars }));
  return parts.join(' · ');
}
