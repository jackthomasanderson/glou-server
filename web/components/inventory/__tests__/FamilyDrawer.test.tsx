import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type React from 'react';
import type { ReactNode } from 'react';
import { openedBottle, product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { ProductDetailView } from '@/lib/products/types';

// #471 — ux-ui.md §10.3: the drawer of a wine. PRIORITY: no level ever set
// on a group of more than one bottle (each change used to open one more).

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));

let detail: ProductDetailView | undefined;
const mutate = vi.fn(async (vars: { id: string }) => ({ id: vars.id }));
const tastingPreset: { id?: string } = {};
vi.mock('@/hooks/useProducts', () => ({
  productDetailKey: (id: string) => ['inventory', 'product', id],
  useProductDetail: () => ({ data: detail, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
}));
// ResponsiveModal (the history's restore confirmation) reads window.matchMedia.
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));
vi.mock('@/hooks/useInventory', () => ({
  useUpdateInventoryItem: () => ({ mutateAsync: mutate, isPending: false }),
  useRollbackField: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('@/hooks/useAlerts', () => ({ useToggleAlertPause: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/components/collections/CollectionPickerInline', () => ({ CollectionPickerInline: () => null }));
vi.mock('@/components/tastings/TastingForm', () => ({
  TastingForm: ({ initialItemId }: { initialItemId?: string }) => { tastingPreset.id = initialItemId; return null; },
}));
vi.mock('../QrCodeModal', () => ({ QrCodeModal: () => null }));
// The drawer's frame only: its content is what is tested.
vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Drawer: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => (isOpen ? <div role="dialog">{children}</div> : null),
  DrawerContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FamilyDrawer as Drawer } from '../FamilyDrawer';

const FamilyDrawer = (props: React.ComponentProps<typeof Drawer>) => (
  <QueryClientProvider client={new QueryClient()}><Drawer {...props} /></QueryClientProvider>
);

const detailOf = (over: Partial<ProductDetailView>): ProductDetailView =>
  ({ ...product(), tastings: [], history: [], ...over }) as ProductDetailView;

const tasting = (over: Partial<ProductDetailView['tastings'][number]>) => ({
  id: 't1', userId: 'user', itemId: null, productId: 'p1', guestName: null, tastedAt: '2026-10-01T00:00:00.000Z',
  context: null, rating: 4, readiness: null, notes: null, foodPairing: null, photoUrl: null, robe: null, nez: null,
  bouche: null, tanin: null, acidite: null, longueurBouche: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...over,
});

beforeEach(() => { mutate.mockClear(); });

describe('FamilyDrawer', () => {
  it('opens a wine known without any bottle: its name, no line, its tastings', () => {
    detail = detailOf({ items: [], tastings: [tasting({ notes: 'Chez des amis' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Cuvée X');
    expect(screen.getByText('Plus aucune bouteille en cave.')).toBeInTheDocument();
    const tastings = screen.getByTestId('family-tastings');
    expect(tastings).toHaveTextContent('Goûté ailleurs');
    expect(tastings).toHaveTextContent('Chez des amis');
  });

  it('heads with the stock sentence of the card and the value: "9 bouteilles · valeur estimée"', () => {
    detail = detailOf({ items: [unit({ quantity: 6, purchasePrice: 20, cellarId: 'garage' }), unit({ quantity: 3, purchasePrice: 30 })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const stock = screen.getByTestId('family-drawer-stock');
    expect(stock.textContent?.replace(/ | /g, ' ')).toMatch(/^9 bouteilles · valeur estimée 210 €$/);
  });

  // #471 (FEAT-95 c3): a cigar is counted in cigars, its lines by boxes and single cigars.
  it('a cigar heads with its cigars, then its boxes: "89 cigares · 3 boîtes fermées · 1 entamée · 4 à l’unité"', () => {
    detail = detailOf({
      category: 'cigar', name: 'Robusto', vintage: null,
      items: [
        unit({ quantity: 3, cigarsPerBox: 25, cellarId: 'garage' }),
        unit({ isOpened: true, cigarsPerBox: 25, cigarsLeft: 10, cellarId: 'garage', openedAt: '2026-10-01T00:00:00.000Z' }),
        unit({ quantity: 4, cellarId: 'garage' }),
      ],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const stock = screen.getByTestId('family-drawer-stock');
    expect(stock.textContent?.replace(/\s/g, ' ')).toBe("89 cigares · 3 boîtes fermées · 1 entamée · 4 à l'unité");
    const lines = screen.getAllByTestId('family-line').map((line) => line.textContent?.replace(/\s/g, ' '));
    expect(lines[0]).toMatch(/^3 boîtes fermées de 25 · Garage/);
    expect(lines[1]).toMatch(/^4 cigares à l'unité · Garage/);
    expect(lines[2]).toMatch(/^Boîte entamée · 10 restants · Garage/);
    // A box is not filled: no level to set on it.
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('a group of six full bottles has no level control: nothing can open one from here', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6 })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('the level of the opened bottle is written on that bottle, from the version shown', () => {
    const sub = openedBottle(60, { id: 'sub', parentItemId: 'group', updatedAt: '2026-10-02T00:00:00.000Z' });
    detail = detailOf({ items: [unit({ id: 'group', quantity: 5 }), sub] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ id: 'sub', patch: { fillLevel: 55 }, expectedUpdatedAt: '2026-10-02T00:00:00.000Z' });
  });

  it('put back full, the bottle is sent intact (it rejoins its group, K)', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 5 }), openedBottle(95, { id: 'sub' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'End' });
    fireEvent.keyUp(slider, { key: 'End' });
    expect(mutate.mock.calls[0][0]).toMatchObject({ id: 'sub', patch: { fillLevel: 100, isOpened: false } });
  });

  it('a tasting of a known bottle says which one: its cellar and price', () => {
    detail = detailOf({
      items: [unit({ id: 'b1', quantity: 2, cellarId: 'garage', purchasePrice: 20 })],
      tastings: [tasting({ itemId: 'b1', readiness: 'PERFECT' })],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const entry = within(screen.getByTestId('family-tastings')).getByRole('listitem');
    expect(entry).toHaveTextContent(/Garage · 20\s€ \/ bouteille/);
    expect(entry).toHaveTextContent('À point');
  });

  it('"Modifier" hands the wine over for its description', () => {
    detail = detailOf({ items: [unit({ quantity: 9 })] });
    const onEdit = vi.fn();
    render(<FamilyDrawer productId="p1" onClose={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(onEdit).toHaveBeenCalledWith(detail);
  });
});

describe('FamilyDrawer — review of W2a', () => {
  it('a tasting is preset on the opened bottle, never on a full one', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 5 }), openedBottle(60, { id: 'sub' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(tastingPreset.id).toBe('sub');
  });

  it('several lines and none opened: nothing is preset, the member picks the bottle', () => {
    detail = detailOf({ items: [unit({ id: 'garage', quantity: 5 }), unit({ id: 'kitchen', quantity: 2, purchasePrice: 30 })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(tastingPreset.id).toBeUndefined();
  });

  it('a single line and none opened: that line, no question to ask', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6 })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(tastingPreset.id).toBe('group');
  });

  it('shows the region, appellation and technical sheet, with where a value came from (FEAT-05)', () => {
    detail = detailOf({
      region: 'Bourgogne', appellation: 'Chablis', color: 'white', lotNumber: 'L42', alcoholDegree: 12.5,
      fieldSources: { appellation: 'ocr', producer: 'import_csv' }, items: [unit({ quantity: 2 })],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const sheet = screen.getByTestId('family-sheet');
    expect(sheet).toHaveTextContent('Bourgogne');
    expect(sheet).toHaveTextContent('Chablis');
    expect(sheet).toHaveTextContent('Blanc');
    expect(sheet).toHaveTextContent('L42');
    expect(sheet).toHaveTextContent('12,5');
    expect(within(sheet).getByTestId('field-source-ocr')).toBeInTheDocument();
    expect(screen.getAllByTestId('field-source-import_csv').length).toBeGreaterThan(0);
  });

  it('the history tells a corrected number: "Nombre corrigé : 2 → 1"', () => {
    detail = detailOf({
      items: [unit({ id: 'g', quantity: 1 })],
      history: [{ id: 1, action: 'CORRECT_QUANTITY', status: 'success', actorId: 'u', actorName: 'Marie', itemId: 'g', changes: [{ field: 'quantity', from: 2, to: 1 }], createdAt: '2026-10-01T00:00:00.000Z' }],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.getByTestId('family-history')).toHaveTextContent('Nombre corrigé : 2 → 1');
  });
});

describe('FamilyDrawer — actions of a line (#471, W3)', () => {
  const menuOf = async (line: HTMLElement) => {
    fireEvent.click(within(line).getByRole('button', { name: 'Actions de cette ligne' }));
    const menu = await screen.findByRole('menu');
    return within(menu).getAllByRole('menuitem').map((item) => item.getAttribute('aria-label'));
  };

  it('a line of full bottles: move, change the price, correct the number, edit, trash (§10.3)', async () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6, cellarId: 'garage' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const [line] = screen.getAllByTestId('family-line');
    expect(await menuOf(line)).toEqual(['Déplacer', 'Changer le prix', 'Corriger le nombre', 'Modifier', 'Mettre à la corbeille']);
  });

  it('an opened bottle: only edited or trashed from its menu', async () => {
    detail = detailOf({ items: [openedBottle(60, { id: 'sub' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const [line] = screen.getAllByTestId('family-line');
    expect(await menuOf(line)).toEqual(['Modifier', 'Mettre à la corbeille']);
  });

  const entry = (over: Partial<ProductDetailView['history'][number]>) => ({
    id: 1, action: 'UPDATE', status: 'success', actorId: 'u', actorName: 'Marie', itemId: 'g', changes: [],
    createdAt: '2026-10-15T00:00:00.000Z', ...over,
  });

  it('the history tells a move once, on the line the bottles went to: "2 bouteilles déplacées vers Garage"', () => {
    detail = detailOf({
      items: [unit({ id: 'k', quantity: 4, cellarId: 'kitchen' }), unit({ id: 'g', quantity: 2, cellarId: 'garage' })],
      history: [
        entry({ id: 2, action: 'MOVE_UNITS', itemId: 'g', count: 2, changes: [{ field: 'quantity', from: null, to: 2 }, { field: 'cellarId', from: 'kitchen', to: 'garage' }] }),
        entry({ id: 1, action: 'MOVE_UNITS', itemId: 'k', count: 2, changes: [{ field: 'quantity', from: 6, to: 4 }] }),
      ],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const history = screen.getByTestId('family-history');
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expect(history).toHaveTextContent('2 bouteilles déplacées vers Garage');
    // Moved back by moving, never by restoring a field.
    expect(within(history).queryByRole('button', { name: 'Restaurer cette valeur' })).toBeNull();
  });

  it('the history tells a new price: "Prix de 2 bouteilles : 20 € → 25 €"', () => {
    detail = detailOf({
      items: [unit({ id: 'g', quantity: 4, purchasePrice: 20 }), unit({ id: 'n', quantity: 2, purchasePrice: 25 })],
      history: [entry({ action: 'REPRICE_UNITS', itemId: 'n', count: 2, changes: [{ field: 'quantity', from: null, to: 2 }, { field: 'purchasePrice', from: 20, to: 25 }] })],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.getByTestId('family-history').textContent?.replace(/[\u00a0\u202f]/g, ' ')).toContain('Prix de 2 bouteilles : 20 € → 25 €');
  });

  it('the history tells why a number was corrected: "Nombre corrigé : 6 → 5 (cassée, offerte ou perdue)"', () => {
    detail = detailOf({
      items: [unit({ id: 'g', quantity: 5 })],
      history: [entry({ action: 'CORRECT_QUANTITY', reason: 'written_off', changes: [{ field: 'quantity', from: 6, to: 5 }] })],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.getByTestId('family-history')).toHaveTextContent('Nombre corrigé : 6 → 5 (cassée, offerte ou perdue)');
  });

  it('boxes of cigars are told as boxes', () => {
    detail = detailOf({
      category: 'cigar',
      items: [unit({ id: 'b', quantity: 1, cigarsPerBox: 25, cellarId: 'garage' })],
      history: [entry({ action: 'MOVE_UNITS', itemId: 'b', count: 1, changes: [{ field: 'cellarId', from: 'kitchen', to: 'garage' }] })],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.getByTestId('family-history')).toHaveTextContent('1 boîte déplacée vers Garage');
  });

  it('the history tells a line that joined this one: "2 bouteilles rejointes (date d\'achat … → …)", nothing to restore', () => {
    detail = detailOf({
      items: [unit({ id: 'g', quantity: 8 })],
      history: [entry({
        action: 'UPDATE', changes: [{ field: 'quantity', from: 6, to: 8 }],
        joinedChanges: [{ field: 'purchasedAt', from: '2026-01-15T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' }],
      })],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const history = screen.getByTestId('family-history');
    expect(history).toHaveTextContent("2 bouteilles rejointes (date d'achat 15/01/2026 → 31/10/2026)");
    expect(within(history).queryByRole('button', { name: 'Restaurer cette valeur' })).toBeNull();
  });
});
