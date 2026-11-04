import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JoiningStep } from '../steps/JoiningStep';
import fr from '../../../public/locales/fr/common.json';
import i18next from 'i18next';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => i18next.t(key, options) as string }),
}));

const setup = (bottleCount: number, cigarCount: number) => {
  render(<JoiningStep cellarCount={2} bottleCount={bottleCount} cigarCount={cigarCount} onExplore={vi.fn()} onAddBottles={vi.fn()} onBack={vi.fn()} />);
};

describe('JoiningStep counts (W4)', () => {
  beforeAll(async () => {
    await i18next.init({ lng: 'fr', resources: { fr: { common: fr } }, defaultNS: 'common', interpolation: { escapeValue: false } });
  });

  it('counts bottles and cigars apart, never one "bottles" total for a mix', () => {
    setup(120, 45);
    expect(screen.getByText('120 bouteilles en stock')).toBeInTheDocument();
    expect(screen.getByText('45 cigares en stock')).toBeInTheDocument();
  });

  it('shows only cigars for a cigar-only household, and 0 bottles for an empty one', () => {
    setup(0, 8);
    expect(screen.queryByText(/bouteilles? en stock/)).toBeNull();
    expect(screen.getByText('8 cigares en stock')).toBeInTheDocument();
  });

  it('says 0 bottle when nothing is in stock', () => {
    setup(0, 0);
    expect(screen.getByText('0 bouteille en stock')).toBeInTheDocument();
  });
});
