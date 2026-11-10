import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import type { TastingItemSummary } from '@/lib/tastings/types';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';

// #703 — a white wine got the red-wine serving card (16–18 °C, aeration,
// "Agneau") because the catalog lookup missed and fell back to its first entry.

// The real bundles, so the chips read the words a member sees (#653).
let i18n: I18n;
let lang = 'fr';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: unknown) => string)(k, { lng: lang, ...o }),
    i18n: { language: lang },
  }),
}));
beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({ lng: 'fr', resources: { fr: { common: fr }, en: { common: en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
});
beforeEach(() => { lang = 'fr'; });
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
    expect(screen.queryByText(/Aération/)).toBeNull();
  });

  it('gives a red wine red-wine serving advice', () => {
    render(<ServiceRecommendations item={wine('red')} />);
    expect(screen.getByText('16–18°C')).toBeInTheDocument();
    expect(screen.getByText(/Aération/)).toBeInTheDocument();
  });

  it('shows no serving card for a wine without a colour', () => {
    const { container } = render(<ServiceRecommendations item={wine(null)} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// #653: an English-speaking member read « Viande rouge grillée · Fromage affiné ».
describe('ServiceRecommendations in English (#653)', () => {
  const pairings = (bundle: unknown) => (bundle as { tastings: { pairings: Record<string, string> } }).tastings.pairings;

  it('shows the food pairings in English, with no French label', () => {
    lang = 'en';
    render(<ServiceRecommendations item={wine('red')} />);
    for (const label of ['Grilled red meat', 'Aged cheese', 'Lamb', 'Mushrooms']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Any French wording that differs from the English one ("Pizza" is both).
    const frenchOnly = Object.entries(pairings(fr)).filter(([key, label]) => label !== pairings(en)[key]);
    for (const [, label] of frenchOnly) expect(screen.queryByText(label)).toBeNull();
  });
});
