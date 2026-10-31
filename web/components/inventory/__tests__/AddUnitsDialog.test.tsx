import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { todayLocalIso } from '@/lib/format';
import { product, unit, openedBottle } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { ProductDetailView } from '@/lib/products/types';

// #471 (FEAT-92 c2, FEAT-101 c3, ux-ui.md §10.3 / §10.4.1, lot E1): from a
// wine's drawer, "Ajouter des bouteilles" asks only the number, the cellar,
// the price of one bottle, the size and the purchase day — never the
// description — and works on a wine without any bottle left.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const mutate = vi.fn();
vi.mock('@/hooks/useProducts', () => ({ useAddUnits: () => ({ mutate, isPending: false }) }));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }, { id: 'kitchen', name: 'Cuisine' }] }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o), i18n: { language: 'fr' } }) }));

import { AddUnitsAction } from '../AddUnitsDialog';

const detail = (items: ProductDetailView['items']) => ({ ...product({ items }), tastings: [], history: [] }) as ProductDetailView;

function open(wine: ProductDetailView) {
  render(<AddUnitsAction product={wine} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter des bouteilles' }));
  return screen.getByRole('dialog');
}

const sent = () => mutate.mock.calls.at(-1)?.[0] as { product: { id: string }; input: Record<string, unknown> };

beforeEach(() => mutate.mockReset());

describe('AddUnitsAction', () => {
  it('asks the number, cellar, price of one bottle, size and purchase day of the new bottles only', () => {
    const dialog = open(detail([unit({ quantity: 6 })]));
    expect(within(dialog).getByText('Cuvée X 2020')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Nombre de bouteilles')).toHaveValue(1);
    expect(within(dialog).getByLabelText("Prix d'une bouteille")).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Taille de bouteille')).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Date d'achat")).toHaveValue(todayLocalIso());
    expect(within(dialog).queryByLabelText('Région')).toBeNull();
    expect(within(dialog).queryByLabelText('Nom')).toBeNull();
  });

  it('starts from the latest line bought (cellar, price, size), dated today: the same day completes it', () => {
    const wine = detail([
      unit({ id: 'old', quantity: 2, cellarId: 'kitchen', purchasePrice: 15, purchasedAt: '2025-06-01' }),
      unit({ id: 'new', quantity: 6, cellarId: 'garage', purchasePrice: 20, bottleSize: '75cl', purchasedAt: '2026-01-15' }),
      openedBottle(60, { cellarId: 'kitchen', purchasePrice: 99, purchasedAt: '2026-09-01' }),
    ]);
    const dialog = open(wine);
    fireEvent.change(within(dialog).getByLabelText('Nombre de bouteilles'), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent()).toMatchObject({
      product: { id: 'p1' },
      input: { quantity: 3, cellarId: 'garage', purchasePrice: 20, bottleSize: '75cl', purchasedAt: todayLocalIso() },
    });
  });

  it('adds bottles to a wine without any bottle left, as its main action (FEAT-101 c3, §10.5)', () => {
    render(<AddUnitsAction product={detail([])} />);
    const button = screen.getByRole('button', { name: 'Ajouter des bouteilles' });
    expect(button).toHaveAttribute('data-primary', 'true');
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nombre de bouteilles'), { target: { value: '3' } });
    fireEvent.change(within(dialog).getByLabelText("Prix d'une bouteille"), { target: { value: '12,5' } });
    fireEvent.change(within(dialog).getByLabelText("Date d'achat"), { target: { value: '2026-03-02' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent().input).toEqual({ quantity: 3, cellarId: null, purchasePrice: 12.5, bottleSize: null, purchasedAt: '2026-03-02' });
  });

  it('starts a wine without bottle from its latest bottle, drunk or gone (cellar, price, size)', () => {
    const wine = detail([
      unit({ cellarId: 'kitchen', purchasePrice: 10, purchasedAt: '2024-01-01', writtenOffAt: '2025-01-01T00:00:00.000Z' }),
      openedBottle(0, { cellarId: 'garage', purchasePrice: 18, bottleSize: '150cl', purchasedAt: '2025-03-01' }),
    ]);
    const dialog = open(wine);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent().input).toMatchObject({ cellarId: 'garage', purchasePrice: 18, bottleSize: '150cl' });
  });

  it('is a secondary action while the wine has bottles in the cellar', () => {
    render(<AddUnitsAction product={detail([unit()])} />);
    expect(screen.getByRole('button', { name: 'Ajouter des bouteilles' })).toHaveAttribute('data-primary', 'false');
  });

  it('refuses no bottle at all, and says so', () => {
    const dialog = open(detail([unit()]));
    fireEvent.change(within(dialog).getByLabelText('Nombre de bouteilles'), { target: { value: '0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Entre 1 et 1000 bouteilles')).toBeInTheDocument();
  });

  it('sends an emptied purchase day as none (D6)', () => {
    const dialog = open(detail([unit()]));
    fireEvent.change(within(dialog).getByLabelText("Date d'achat"), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent().input.purchasedAt).toBeNull();
  });

  it('closes once the bottles are added', () => {
    mutate.mockImplementation((_vars, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    const dialog = open(detail([unit()]));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// #471 (FEAT-95 c2, decision point 52, ux-ui.md §10.4.1): for a cigar, the
// number and "boîtes de combien" or "à l'unité", the cellar and the price
// of ONE box or cigar.
describe('AddUnitsAction on a cigar', () => {
  const cigar = (items: ProductDetailView['items']) =>
    ({ ...product({ category: 'cigar', name: 'Robusto', vintage: null, items }), tastings: [], history: [] }) as ProductDetailView;

  function openCigar(robusto: ProductDetailView) {
    render(<AddUnitsAction product={robusto} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter des cigares' }));
    return screen.getByRole('dialog');
  }

  it('adds closed boxes like the latest ones: their size and the price of one box', () => {
    const dialog = openCigar(cigar([unit({ quantity: 3, cigarsPerBox: 25, cellarId: 'garage', purchasePrice: 200 })]));
    expect(within(dialog).getByRole('radio', { name: 'Boîtes fermées' })).toBeChecked();
    expect(within(dialog).getByLabelText('Cigares par boîte')).toHaveValue(25);
    expect(within(dialog).queryByLabelText('Taille de bouteille')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Nombre de boîtes'), { target: { value: '2' } });
    expect(within(dialog).getByText('soit 50 cigares')).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Prix d'une boîte")).toHaveValue('200');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent().input).toEqual({ quantity: 2, cigarsPerBox: 25, cellarId: 'garage', purchasePrice: 200, purchasedAt: todayLocalIso() });
  });

  it('adds single cigars at the price of one cigar', () => {
    const dialog = openCigar(cigar([unit({ quantity: 3, cigarsPerBox: 25, purchasePrice: 200 })]));
    fireEvent.click(within(dialog).getByRole('radio', { name: "À l'unité" }));
    expect(within(dialog).queryByLabelText('Cigares par boîte')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Nombre de cigares'), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByLabelText("Prix d'un cigare"), { target: { value: '9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent().input).toMatchObject({ quantity: 4, cigarsPerBox: null, purchasePrice: 9 });
  });

  // Review #807: a box price is never offered as the price of one cigar
  // (3 boxes at 200 €, then 4 single cigars: 36 €, not 800 €).
  it('empties the price prefilled from boxes when switching to single cigars, or to another box size', () => {
    const dialog = openCigar(cigar([unit({ quantity: 3, cigarsPerBox: 25, purchasePrice: 200 })]));
    fireEvent.click(within(dialog).getByRole('radio', { name: "À l'unité" }));
    expect(within(dialog).getByLabelText("Prix d'un cigare")).toHaveValue('');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Boîtes fermées' }));
    expect(within(dialog).getByLabelText("Prix d'une boîte")).toHaveValue('200');
    fireEvent.change(within(dialog).getByLabelText('Cigares par boîte'), { target: { value: '10' } });
    expect(within(dialog).getByLabelText("Prix d'une boîte")).toHaveValue('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent().input).toMatchObject({ quantity: 1, cigarsPerBox: 10, purchasePrice: null });
  });

  it('keeps a price the member typed whatever the storage', () => {
    const dialog = openCigar(cigar([unit({ quantity: 3, cigarsPerBox: 25, purchasePrice: 200 })]));
    fireEvent.change(within(dialog).getByLabelText("Prix d'une boîte"), { target: { value: '180' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: "À l'unité" }));
    expect(within(dialog).getByLabelText("Prix d'un cigare")).toHaveValue('180');
  });

  it('starts from single cigars when the latest ones were', () => {
    const dialog = openCigar(cigar([unit({ quantity: 4, purchasePrice: 9 })]));
    expect(within(dialog).getByRole('radio', { name: "À l'unité" })).toBeChecked();
    expect(within(dialog).getByLabelText("Prix d'un cigare")).toHaveValue('9');
  });

  it('refuses a box without its number of cigars, and says so', () => {
    const dialog = openCigar(cigar([]));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Entre 1 et 1000 cigares par boîte')).toBeInTheDocument();
  });
});
