import type { AnalyticsStats } from '@shared/analytics';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * #702: the "Global valuation" KPI. A unit with no price is worth 0 €, so a
 * bare total would read as a cellar worth nothing: with no price at all the
 * KPI says the price is not entered, and with some missing it says how many.
 */
export function valuationKpi(
  stats: Pick<AnalyticsStats, 'totalValuation' | 'totalActiveItems' | 'unpricedUnits'>,
  formatCurrency: (value: number) => string,
  t: Translate,
): { value: string; hint: string } {
  const { totalValuation, totalActiveItems, unpricedUnits } = stats;
  if (totalActiveItems > 0 && unpricedUnits >= totalActiveItems) {
    return { value: t('analytics.stats.totalValuationNoPrice'), hint: t('analytics.stats.totalValuationNoPriceHint') };
  }
  return {
    value: formatCurrency(totalValuation),
    hint: unpricedUnits > 0
      ? t('analytics.stats.totalValuationUnpriced', { count: unpricedUnits })
      : t('analytics.stats.totalValuationHint'),
  };
}
