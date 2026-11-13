import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { qk } from '@/lib/queryKeys';
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
const connectivity = vi.hoisted(() => ({ online: true as boolean | null }));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => connectivity.online }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o), i18n: { language: 'fr' } }) }));

import { AddUnitsAction, cellarPageStart } from '../AddUnitsDialog';

const detail = (items: ProductDetailView['items']) => ({ ...product({ items }), tastings: [], history: [] }) as ProductDetailView;

function open(wine: ProductDetailView) {
  render(<AddUnitsAction product={wine} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter des bouteilles' }));
  return screen.getByRole('dialog');
}

const sent = () => mutate.mock.calls.at(-1)?.[0] as { product: { id: string }; input: Record<string, unknown> };

beforeEach(() => {
  mutate.mockReset();
  connectivity.online = true;
});

describe('AddUnitsAction', () => {
  // #834: the default purchase day is the instance's (the API's default when
  // none is sent), not the browser's: here the instance is 14 h ahead of UTC,
  // already on the 16th while every browser zone west of it is still on the 15th.
  it("dates the new bottles today where the instance is, not where the browser is", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    try {
      const client = new QueryClient();
      client.setQueryData(qk.auth.me, { instanceTimeZone: 'Pacific/Kiritimati' });
      render(<QueryClientProvider client={client}><AddUnitsAction product={detail([unit({ quantity: 6 })])} /></QueryClientProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter des bouteilles' }));
      expect(within(screen.getByRole('dialog')).getByLabelText("Date d'achat")).toHaveValue('2026-01-16');
    } finally {
      vi.useRealTimers();
    }
  });

  it('offline: still shown, unavailable, with the reason, and opens nothing (FEAT-108, ux-ui.md §10.8)', () => {
    connectivity.online = false;
    render(<AddUnitsAction product={detail([unit({ quantity: 6 })])} />);
    const button = screen.getByRole('button', { name: 'Ajouter des bouteilles' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Disponible au retour de la connexion');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('started already offline (no `offline` event, the probe still says reachable): blocked too (review of #823, N2)', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      render(<AddUnitsAction product={detail([unit({ quantity: 6 })])} />);
      const button = screen.getByRole('button', { name: 'Ajouter des bouteilles' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(button);
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      onLine.mockRestore();
    }
  });

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

  it('keeps the cellar when the one already chosen is picked again (recette n°5: it was emptied, the bottles went "Sans cave")', async () => {
    const dialog = open(detail([unit({ quantity: 6, cellarId: 'garage' })]));
    const trigger = within(dialog).getByRole('button', { name: /Caves/ });
    expect(trigger).toHaveTextContent('Garage');
    fireEvent.click(trigger);
    const garage = (await screen.findAllByRole('option')).find((option) => option.textContent === 'Garage') as HTMLElement;
    fireEvent.click(garage);
    expect(trigger).toHaveTextContent('Garage');
    // And the list closes on that click, as on any other choice (recette n°5 bis: it stayed open until Échap).
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent().input.cellarId).toBe('garage');
  });

  it('opened from a cell of a cellar\'s plan, offers that cellar rather than the latest line\'s (recette n°5 of #847)', () => {
    render(<AddUnitsAction product={detail([unit({ quantity: 6, cellarId: 'garage', purchasePrice: 20 })])} start={{ cellarId: 'kitchen' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter des bouteilles' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Caves/ })).toHaveTextContent('Cuisine');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(sent().input).toMatchObject({ cellarId: 'kitchen', purchasePrice: 20 });
  });

  it('on a cellar\'s page, offers that cellar, or the cell\'s when opened from one (recette n°5 of #847)', () => {
    expect(cellarPageStart('kitchen', null)).toEqual({ cellarId: 'kitchen' });
    expect(cellarPageStart('kitchen', { at: { cellarId: 'garage' } })).toEqual({ cellarId: 'garage' });
    expect(cellarPageStart('kitchen', {})).toEqual({ cellarId: 'kitchen' });
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
