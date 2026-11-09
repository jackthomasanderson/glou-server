import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { TastingNote } from '@/lib/tastings/types';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => t(k, o), i18n: { language: 'fr' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));

import { TastingDetailDrawer } from '../TastingDetailDrawer';

beforeAll(async () => { t = await frenchT(); });

const base = {
  id: 't1', userId: 'u1', tastedAt: '2026-11-01T00:00:00.000Z', rating: 4,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  product: { id: 'p1', name: 'Pauillac', producer: 'Château X', category: 'wine' },
} as unknown as TastingNote;

const open = (note: TastingNote) =>
  render(<TastingDetailDrawer note={note} open onClose={() => {}} onEdit={() => {}} />);

describe('TastingDetailDrawer', () => {
  // #708: HeroUI added its own X next to the drawer's.
  it('has a single close button', () => {
    open(base);
    expect(screen.getAllByRole('button', { name: /^(fermer|close)$/i })).toHaveLength(1);
  });

  // #642: the expert grid was saved, and shown nowhere.
  it('shows the expert grid when at least one of its fields is filled', () => {
    open({ ...base, robe: 'Grenat', nez: 'Cassis, cèdre', bouche: 'Ample', tanin: 4, acidite: 3, longueurBouche: 12 });
    const grid = screen.getByRole('region', { name: 'Grille de dégustation structurée' });
    const row = (label: string) => within(grid).getByText(label).nextElementSibling?.textContent;
    expect(row('Robe')).toBe('Grenat');
    expect(row('Nez')).toBe('Cassis, cèdre');
    expect(row('Bouche')).toBe('Ample');
    expect(row('Tanin (1-5)')).toBe('4');
    expect(row('Acidité (1-5)')).toBe('3');
    expect(row('Longueur en bouche')).toBe('12 s');
  });

  it('shows only the expert fields that are filled', () => {
    open({ ...base, nez: 'Fruits noirs', tanin: null, longueurBouche: 0 });
    const grid = screen.getByRole('region', { name: 'Grille de dégustation structurée' });
    expect(within(grid).getByText('Nez')).toBeInTheDocument();
    expect(within(grid).queryByText('Robe')).toBeNull();
    expect(within(grid).queryByText('Tanin (1-5)')).toBeNull();
    // 0 s is a value the form accepts (min 0): it is shown.
    expect(within(grid).getByText('Longueur en bouche').nextElementSibling?.textContent).toBe('0 s');
  });

  it('shows no expert grid when none of its fields is filled', () => {
    open({ ...base, robe: '', nez: null });
    expect(screen.queryByRole('region', { name: 'Grille de dégustation structurée' })).toBeNull();
  });
});
