import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { product, unit } from '@/lib/products/__tests__/factories';
import type { Product } from '@/lib/products/types';
import type { KnownWineFields } from '@/hooks/useKnownWine';

// #471 (FEAT-97 c4, review #817): turning a wish into stock answers "Vous
// avez déjà ce vin" too. Joining a known wine starts from its latest line —
// its size, and its cellar and price when none was typed — so the same
// purchase completes it; a cigar is asked closed boxes of M or single cigars,
// and a cigar wish (without vitola) finds every vitola of the reference.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

let wishes: unknown[] = [];
let sameName: Product[] = [];
const asked = vi.fn();
const convert = vi.fn();
vi.mock('@/hooks/useWishlist', () => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useWishlist: () => ({ data: wishes, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
    useCreateWishlistItem: idle, useUpdateWishlistItem: idle, useDeleteWishlistItem: idle, useRecordPriceSeen: idle,
    useConvertToInventory: () => ({ mutateAsync: convert, isPending: false }),
  };
});
vi.mock('@/hooks/useKnownWine', () => ({
  useKnownWine: (fields: KnownWineFields, enabled: boolean) => { asked(fields, enabled); return enabled ? sameName : []; },
}));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useProducts', () => ({ useAddUnits: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o), i18n: { language: 'fr' } }),
}));

import { WishlistDashboard } from '../WishlistDashboard';

const wish = (fields: Record<string, unknown> = {}) => ({
  id: 'w1', userId: 'u1', name: 'Cuvée X', producer: 'Domaine Y', category: 'wine', vintage: 2018,
  targetQuantity: 2, maxPrice: null, lastSeenPrice: null, priority: 'medium', status: 'active', notes: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...fields,
});

function openConversion() {
  render(<WishlistDashboard />);
  fireEvent.click(screen.getByTestId('wishlist-convert-button'));
  return screen.getByRole('dialog');
}

const sent = () => convert.mock.calls.at(-1)?.[0] as { id: string; data: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
  convert.mockResolvedValue({});
});

describe('WishlistDashboard — a wish for a wine already known (FEAT-97 c4)', () => {
  it('joins the wine with the size, cellar and price of its latest line: the same purchase completes it', async () => {
    wishes = [wish()];
    sameName = [product({
      id: 'p1', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2018,
      items: [unit({ quantity: 6, cellarId: 'garage', purchasePrice: 20, bottleSize: '75cl', purchasedAt: '2026-01-15' })],
    })];
    const dialog = openConversion();
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));

    expect(within(dialog).getByTestId('known-wine-joining')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Lieu d'achat")).toBeNull();
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent()).toEqual({
      id: 'w1',
      data: { productId: 'p1', quantity: 2, bottleSize: '75cl', cellarId: 'garage', purchasePrice: 20 },
    });
  });

  const montecristo = (line: Parameters<typeof unit>[0]) => product({
    id: 'p2', category: 'cigar', name: 'No. 2', producer: 'Montecristo', vintage: null, format: 'Robusto',
    items: [unit({ quantity: 3, purchasedAt: '2026-01-15', ...line })],
  });
  const cigarWish = (targetQuantity: number) =>
    wish({ category: 'cigar', name: 'No. 2', producer: 'Montecristo', vintage: null, targetQuantity, lastSeenPrice: 15 });

  it.each([
    [10, 1],
    [60, 3],
  ])('turns a wish of %i cigars joining boxes of 25 into %i boxes at the box price, not the price of one cigar (verifier #817)', async (cigars, boxes) => {
    wishes = [cigarWish(cigars)];
    sameName = [montecristo({ cigarsPerBox: 25, purchasePrice: 200 })];
    const dialog = openConversion();
    // A wish has no vitola: every vitola of the reference is looked up.
    expect(asked).toHaveBeenCalledWith(expect.objectContaining({ category: 'cigar', name: 'No. 2', anyFormat: true }), true);
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));

    expect(within(dialog).getByTestId('cigar-storage')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent().data).toMatchObject({ productId: 'p2', quantity: boxes, cigarsPerBox: 25, purchasePrice: 200 });
    expect(sent().data).not.toHaveProperty('bottleSize');
  });

  it('keeps the number of cigars and the price of one cigar seen when joining single cigars', async () => {
    wishes = [cigarWish(10)];
    sameName = [montecristo({ cigarsPerBox: null, purchasePrice: 9 })];
    const dialog = openConversion();
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent().data).toMatchObject({ productId: 'p2', quantity: 10, cigarsPerBox: null, purchasePrice: 15 });
  });

  it('keeps the size typed when the wine has no bottle left in stock (verifier #817)', async () => {
    wishes = [wish()];
    sameName = [product({ id: 'p1', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2018, items: [] })];
    const dialog = openConversion();
    fireEvent.change(within(dialog).getByLabelText(t('wishlist.convert.bottleSize')), { target: { value: '150cl' } });
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent().data).toMatchObject({ productId: 'p1', bottleSize: '150cl' });
  });

  it('"C\'est un autre vin" converts into a new wine told apart', async () => {
    wishes = [wish()];
    sameName = [product({ id: 'p1', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2018 })];
    const dialog = openConversion();
    fireEvent.click(within(dialog).getByTestId('known-wine-distinct'));
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent().data).toMatchObject({ distinctFrom: ['p1'], quantity: 2 });
    expect(sent().data).not.toHaveProperty('productId');
  });

  const pickCellar = async (dialog: HTMLElement, name: string) => {
    const trigger = within(dialog).getByRole('button', { name: /Cave/ });
    fireEvent.click(trigger);
    fireEvent.click((await screen.findAllByRole('option')).find((option) => option.textContent === name) as HTMLElement);
    return trigger;
  };

  it('keeps the cellar picked again (recette n°5 of #847)', async () => {
    wishes = [wish()];
    sameName = [product({ id: 'p1', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2018, items: [unit({ quantity: 6, cellarId: 'garage' })] })];
    const dialog = openConversion();
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));
    const trigger = await pickCellar(dialog, 'Garage');
    expect(trigger).toHaveTextContent('Garage');
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent().data).toMatchObject({ productId: 'p1', cellarId: 'garage' });
  });

  it('offers "Aucune cave" as a choice, sent as none, kept over the known wine\'s cellar', async () => {
    wishes = [wish()];
    sameName = [product({ id: 'p1', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2018, items: [unit({ quantity: 6, cellarId: 'garage' })] })];
    const dialog = openConversion();
    await pickCellar(dialog, 'Aucune cave');
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent().data).toMatchObject({ productId: 'p1', cellarId: null });
  });
});

// #587: a spirit wished for is asked its ABV at the conversion, optional —
// left empty, it stays unknown (never an invented 0 %).
describe('WishlistDashboard — the ABV of a spirit converted (#587)', () => {
  const abv = (dialog: HTMLElement) => within(dialog).queryByTestId('wishlist-convert-abv');
  const spiritWish = () => wish({ category: 'spirit', name: 'Lagavulin 16', producer: 'Lagavulin', vintage: null });

  it('sends the ABV typed, with a comma', async () => {
    wishes = [spiritWish()];
    sameName = [];
    const dialog = openConversion();
    fireEvent.change(abv(dialog) as HTMLElement, { target: { value: '43,5' } });
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent().data).toMatchObject({ alcoholDegree: 43.5, quantity: 2 });
  });

  it('sends it unknown when left empty', async () => {
    wishes = [spiritWish()];
    sameName = [];
    const dialog = openConversion();
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    await vi.waitFor(() => expect(convert).toHaveBeenCalled());
    expect(sent().data).toMatchObject({ alcoholDegree: null });
  });

  it('refuses an ABV above 100', async () => {
    wishes = [spiritWish()];
    sameName = [];
    const dialog = openConversion();
    fireEvent.change(abv(dialog) as HTMLElement, { target: { value: '430' } });
    fireEvent.click(within(dialog).getByTestId('wishlist-convert-submit'));
    expect(await within(dialog).findByText(t('inventory.validation.range', { min: 0, max: 100 }))).toBeInTheDocument();
    expect(convert).not.toHaveBeenCalled();
  });

  it('asks no ABV for a wine', () => {
    wishes = [wish()];
    sameName = [];
    expect(abv(openConversion())).toBeNull();
  });

  it('asks no ABV when joining a known spirit', () => {
    wishes = [spiritWish()];
    sameName = [product({ id: 'p3', category: 'spirit', name: 'Lagavulin 16', producer: 'Lagavulin', vintage: null })];
    const dialog = openConversion();
    expect(abv(dialog)).not.toBeNull();
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));
    expect(abv(dialog)).toBeNull();
  });
});
