import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ValuationBreakdown } from '../AnalyticsDashboard';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const digits = (el: HTMLElement) => (el.textContent ?? '').replace(/[^\d+-]/g, '');

// #838: the gain compares the value and the cost of the units in stock, so a
// bottle drunk at its purchase price no longer shows as a loss; what was spent
// overall is its own line.
describe('ValuationBreakdown', () => {
  it('computes the gain from the cost of the stock, and shows the total spend apart', () => {
    render(<ValuationBreakdown t={t} totalValuation={80} inStockPurchasePrice={80} totalPurchasePrice={120} />);

    expect(digits(screen.getByTestId('valuation-in-stock-cost'))).toBe('80');
    const gain = screen.getByTestId('valuation-gain');
    expect(gain).toHaveTextContent('+');
    expect(gain).toHaveTextContent('(+0%)');
    // No loss: no minus sign before an amount ("Plus-value" has a hyphen).
    expect(gain).not.toHaveTextContent(/[-−]\s*(€|\d)/);
    const spend = screen.getByTestId('valuation-total-spend');
    expect(spend).toHaveTextContent(/^Dépense totale/);
    expect(digits(spend)).toBe('120');
  });

  it('shows a real gain on the stock', () => {
    render(<ValuationBreakdown t={t} totalValuation={230} inStockPurchasePrice={184} totalPurchasePrice={200} />);

    expect(screen.getByTestId('valuation-gain')).toHaveTextContent('(+25%)');
  });

  it('shows no gain when nothing in stock has a purchase price', () => {
    render(<ValuationBreakdown t={t} totalValuation={0} inStockPurchasePrice={0} totalPurchasePrice={60} />);

    expect(screen.queryByTestId('valuation-gain')).toBeNull();
    expect(digits(screen.getByTestId('valuation-total-spend'))).toBe('60');
  });
});
