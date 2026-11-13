import type { AnalyticsStats } from '@shared/analytics';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** "3 bouteilles", "1 cigare", "2 bouteilles et 25 cigares": what has no price. */
function unpricedLabel(bottles: number, cigars: number, t: Translate): string {
  const parts = [
    bottles > 0 ? t('inventory.stats.bottles', { count: bottles }) : null,
    cigars > 0 ? t('inventory.stats.cigars', { count: cigars }) : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 2 ? t('analytics.stats.unpricedBoth', { bottles: parts[0], cigars: parts[1] }) : parts[0];
}

/**
 * #702: the "Global valuation" KPI. A unit with no price is worth 0 €, so a
 * bare total would read as a cellar worth nothing: with no price at all the
 * KPI says the price is not entered, and with some missing it says how many.
 */
export function valuationKpi(
  stats: Pick<AnalyticsStats, 'totalValuation' | 'totalActiveItems' | 'unpricedUnits' | 'unpricedCigars'>,
  formatCurrency: (value: number) => string,
  t: Translate,
): { value: string; hint: string } {
  const { totalValuation, totalActiveItems, unpricedUnits, unpricedCigars } = stats;
  if (totalActiveItems > 0 && unpricedUnits >= totalActiveItems) {
    return { value: t('analytics.stats.totalValuationNoPrice'), hint: t('analytics.stats.totalValuationNoPriceHint') };
  }
  return {
    value: formatCurrency(totalValuation),
    hint: unpricedUnits > 0
      ? t('analytics.stats.totalValuationUnpriced', { what: unpricedLabel(unpricedUnits - unpricedCigars, unpricedCigars, t) })
      : t('analytics.stats.totalValuationHint'),
  };
}
