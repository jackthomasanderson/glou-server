import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockTotals, stockTotalsLabel } from '../StockTotals';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

// FEAT-96, decision 50: the grand total heads the analytics page.
describe('StockTotals', () => {
  it('says "165 bouteilles · 89 cigares"', () => {
    render(<StockTotals bottles={165} cigars={89} t={t} />);
    expect(screen.getByTestId('analytics-stock-totals')).toHaveTextContent('165 bouteilles · 89 cigares');
  });
  it('leaves out the kind that is not held, and says 0 bouteille when empty', () => {
    expect(stockTotalsLabel(1, 0, t)).toBe('1 bouteille');
    expect(stockTotalsLabel(0, 12, t)).toBe('12 cigares');
    expect(stockTotalsLabel(0, 0, t)).toBe('0 bouteille');
  });
});
