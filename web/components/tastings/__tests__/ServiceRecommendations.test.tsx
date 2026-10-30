import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { TastingItemSummary } from '@/lib/tastings/types';

// #703 — a white wine got the red-wine serving card (16–18 °C, aeration,
// "Agneau") because the catalog lookup missed and fell back to its first entry.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));
vi.mock('@heroui/react', () => ({
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

import { ServiceRecommendations } from '../ServiceRecommendations';

function wine(color: string | null): TastingItemSummary {
  return { id: 'i1', name: 'Chablis', producer: 'Domaine Test', category: 'wine', color };
}

describe('ServiceRecommendations wine colours (#703)', () => {
  it('gives a white wine white-wine serving advice', () => {
    render(<ServiceRecommendations item={wine('white')} />);
    expect(screen.getByText('10–12°C')).toBeInTheDocument();
    expect(screen.getByText('Poisson')).toBeInTheDocument();
    expect(screen.queryByText('16–18°C')).toBeNull();
    expect(screen.queryByText('Agneau')).toBeNull();
    expect(screen.queryByText('tastings.recommendations.aeration')).toBeNull();
  });

  it('gives a red wine red-wine serving advice', () => {
    render(<ServiceRecommendations item={wine('red')} />);
    expect(screen.getByText('16–18°C')).toBeInTheDocument();
    expect(screen.getByText('tastings.recommendations.aeration')).toBeInTheDocument();
  });

  it('shows no serving card for a wine without a colour', () => {
    const { container } = render(<ServiceRecommendations item={wine(null)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
