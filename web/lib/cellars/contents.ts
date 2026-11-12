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

/** Longer than this, a name is allowed to wrap: it would not fit on a line of the dialog. */
const UNBREAKABLE_NAME_MAX = 24;

/**
 * #841: « ZZ ⏎ R4 B » — a short name quoted in a sentence stays on one line
 * (non-breaking spaces inside it). A long one keeps its normal wrapping.
 */
export function keepNameTogether(name: string): string {
  return name.length <= UNBREAKABLE_NAME_MAX ? name.replace(/ /g, '\u00a0') : name;
}

/**
 * #707: the delete confirmation names the cellar and says what stays in the
 * inventory, without a cellar ("Ce qu'elle contient (12 bouteilles)…").
 */
export function cellarDeleteConfirmText(
  cellar: { name: string; stats?: Pick<CellarStats, 'bottles' | 'cigars'> },
  t: Translate,
): string {
  const { stats } = cellar;
  const name = keepNameTogether(cellar.name);
  if (!stats) return t('cellars.deleteConfirm', { name });
  if (stats.bottles === 0 && stats.cigars === 0) return t('cellars.deleteConfirmEmpty', { name });
  return t('cellars.deleteConfirmContents', { name, contents: cellarContentsLabel(stats, t) });
}
