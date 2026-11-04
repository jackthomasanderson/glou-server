type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The collection's grand total (FEAT-96, decision 50): "165 bouteilles · 89
 * cigares", in units in stock like the statistics of the lists. The kinds the
 * collection does not hold are left out; an empty one says "0 bouteille".
 */
export function stockTotalsLabel(bottles: number, cigars: number, t: Translate): string {
  const parts: string[] = [];
  if (bottles > 0 || cigars === 0) parts.push(t('inventory.stats.bottles', { count: bottles }));
  if (cigars > 0) parts.push(t('inventory.stats.cigars', { count: cigars }));
  return parts.join(' · ');
}

export function StockTotals({ bottles, cigars, t }: { bottles: number; cigars: number; t: Translate }) {
  return (
    <p data-testid="analytics-stock-totals" className="text-sm font-semibold mt-1">
      {stockTotalsLabel(bottles, cigars, t)}
    </p>
  );
}
