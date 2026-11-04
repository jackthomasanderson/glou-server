import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { product, unit } from '@/lib/products/__tests__/factories';

// #471 (FEAT-97, review #817): two wines of the same name already told apart
// both show; each "Ajouter" button says which wine it adds to, for a screen
// reader as for the eye.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));

import { KnownWineBanner } from '../KnownWineBanner';

describe('KnownWineBanner', () => {
  it('names the wine and its stock on each button when two wines share a name', () => {
    const first = product({ id: 'p1', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2020, items: [unit({ quantity: 6, cellarId: 'garage' })] });
    const second = product({ id: 'p2', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2020, items: [] });
    const onAdd = vi.fn();
    render(<KnownWineBanner matches={[first, second]} onAdd={onAdd} onDistinct={vi.fn()} t={(key, o) => t(key, o)} />);

    expect(screen.getByRole('button', {
      name: 'Ajouter des bouteilles à ce vin : Domaine Y · Cuvée X 2020, 6 bouteilles en cave · Garage : 6',
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter des bouteilles à ce vin : Domaine Y · Cuvée X 2020, Plus de bouteille' }));
    expect(onAdd).toHaveBeenCalledWith(second);
    expect(screen.getAllByTestId('known-wine-match')).toHaveLength(2);
  });

  it('speaks of cigars for a cigar reference', () => {
    const cigar = product({ id: 'p3', category: 'cigar', name: 'No. 2', producer: 'Montecristo', vintage: null, items: [unit({ quantity: 2, cigarsPerBox: 25 })] });
    render(<KnownWineBanner matches={[cigar]} onAdd={vi.fn()} onDistinct={vi.fn()} t={(key, o) => t(key, o)} />);

    expect(screen.getByText('Vous avez déjà ce cigare')).toBeInTheDocument();
    expect(screen.getByTestId('known-wine-stock')).toHaveTextContent('50 cigares en cave');
    expect(screen.getByRole('button', { name: "C'est un autre cigare" })).toBeInTheDocument();
  });
});
