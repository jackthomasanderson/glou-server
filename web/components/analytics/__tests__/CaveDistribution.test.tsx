import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaveDistribution } from '../AnalyticsDashboard';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

// Recette #847 (KO 10.2): the distribution by cellar sums to the stock — the
// bottles in no cellar have a row of their own, named "Sans cave".
describe('CaveDistribution', () => {
  it('names the row of the bottles in no cellar "Sans cave"', () => {
    render(<CaveDistribution t={t} caves={[
      { cellarId: 'c1', cellarName: 'Garage', cellarType: 'VINTAGE', count: 104, valuation: 1040 },
      { cellarId: null, cellarName: '', cellarType: 'VINTAGE', count: 1, valuation: 30 },
    ]} />);
    const rows = screen.getAllByTestId('analytics-cave');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Garage');
    expect(rows[1]).toHaveTextContent('Sans cave');
    expect(rows[1]).toHaveTextContent('1 —');
  });
});
