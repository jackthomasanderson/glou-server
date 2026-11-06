import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryBreakdown } from '../AnalyticsDashboard';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

// Recette n°5 quater of #847 (KO 6.4): the legend read « Cigares ... » and
// « Vins R... »: each category is named in full, on two lines if need be.
describe('CategoryBreakdown', () => {
  it('names every category in full, never cut with an ellipsis', () => {
    render(<CategoryBreakdown t={t} total={30} items={[
      { category: 'wine', count: 20, valuation: 400 },
      { category: 'cigar', count: 10, valuation: 100 },
    ]} />);
    const names = screen.getAllByTestId('analytics-category-name');
    expect(names.map((name) => name.textContent)).toEqual(['Vins Rouges & Blancs', 'Cigares de Prestige']);
    for (const name of names) {
      expect(name.classList.contains('truncate')).toBe(false);
      expect(name.className).toMatch(/break-words/);
    }
    expect(screen.getAllByTestId('analytics-category')[1]).toHaveTextContent('10 cigares');
  });
});
