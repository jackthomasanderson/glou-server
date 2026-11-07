import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TastingNote } from '@/lib/tastings/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));

import { TastingCard } from '../TastingCard';

// Recette n°5 ter of #847: a long title ended in "…" ("ZZ Recette Cuvée Une — ZZ Recett…").
describe('TastingCard title', () => {
  it('shows the whole title, wrapping instead of cutting it with an ellipsis', () => {
    const note = {
      id: 't1', userId: 'u1', tastedAt: '2026-11-01T00:00:00.000Z', rating: 4,
      product: { id: 'p1', name: 'ZZ Recette Cuvée Une', producer: 'ZZ Recette Domaine des Très Longs Noms', category: 'wine' },
    } as unknown as TastingNote;
    render(<TastingCard note={note} onView={() => {}} onEdit={() => {}} onDelete={() => {}} />);
    const title = screen.getByTestId('tasting-card-title');
    expect(title.textContent).toBe('ZZ Recette Cuvée Une — ZZ Recette Domaine des Très Longs Noms');
    const style = getComputedStyle(title);
    expect(title.classList.contains('truncate')).toBe(false);
    expect(style.whiteSpace).not.toBe('nowrap');
    expect(style.textOverflow).not.toBe('ellipsis');
  });
});
