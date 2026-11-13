import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TastingAnalytics } from '@/lib/tastings/types';

// #700: an average rating reads "4,3" in French, not "4.3".
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));
const data: TastingAnalytics = {
  producerRankings: [{ producer: 'Domaine A', avgRating: 4.3, count: 3 }],
  topItems: [],
  flopItems: [],
  readinessDistribution: { TOO_YOUNG: 0, PERFECT: 0, PEAK: 0, PAST: 0 },
};
vi.mock('@/hooks/useTastings', () => ({ useTastingAnalytics: () => ({ data, isLoading: false }) }));

import { TastingInsights } from '../TastingInsights';

describe('TastingInsights', () => {
  it('writes an average rating with the decimal separator of the language', () => {
    render(<TastingInsights />);
    expect(screen.getByText('4,3')).toBeInTheDocument();
  });
});
