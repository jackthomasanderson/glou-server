import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  useProductMovements: () => ({ data: undefined, isError: false }),
}));
// ResponsiveModal (the history's restore confirmation) reads window.matchMedia.
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyUndoable: vi.fn() }));
const removeSlot = vi.fn<(vars: { slotId: string }) => Promise<void>>(async () => undefined);
vi.mock('@/hooks/useCellars', () => ({
  useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }),
  useRemoveSlot: () => ({ mutateAsync: removeSlot, isPending: false }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useUpdateInventoryItem: () => ({ mutateAsync: mutate, isPending: false }),
  useDeleteInventoryItem: () => ({ mutate: vi.fn(), isPending: false }),
  useRollbackField: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('@/hooks/useAlerts', () => ({ useToggleAlertPause: () => ({ mutate: vi.fn(), isPending: false }) }));
// Connectivity is probed by a GET of its own (FEAT-108): set by the test.
const connectivity = vi.hoisted(() => ({ online: true as boolean | null }));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => connectivity.online }));
vi.mock('@/components/collections/CollectionPickerInline', () => ({ CollectionPickerInline: () => null }));
const tastingFromCell: { value?: { itemId: string; slotId: string } } = {};
vi.mock('@/components/tastings/TastingForm', () => ({
  TastingForm: ({ initialItemId, fromCell }: { initialItemId?: string; fromCell?: { itemId: string; slotId: string } }) => {
    tastingPreset.id = initialItemId;
    tastingFromCell.value = fromCell;
    return null;
  },
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

let queryClient = new QueryClient();
const FamilyDrawer = (props: React.ComponentProps<typeof Drawer>) => (
  <QueryClientProvider client={queryClient}><Drawer {...props} /></QueryClientProvider>
);

const detailOf = (over: Partial<ProductDetailView>): ProductDetailView =>
  ({ ...product(), tastings: [], history: [], ...over }) as ProductDetailView;

const tasting = (over: Partial<ProductDetailView['tastings'][number]>) => ({
  id: 't1', userId: 'user', itemId: null, productId: 'p1', guestName: null, cellarId: null, cellarName: null, purchasedAt: null, snapshotAt: null, tastedAt: '2026-10-01T00:00:00.000Z',
  context: null, rating: 4, readiness: null, notes: null, foodPairing: null, photoUrl: null, robe: null, nez: null,
  bouche: null, tanin: null, acidite: null, longueurBouche: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...over,
});

beforeEach(() => { mutate.mockClear(); queryClient = new QueryClient(); connectivity.online = true; });

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

  // #471 (recette v2): a cigar's drawer said « Aucune dégustation de ce vin ».
  it('a cigar without any tasting says so of the cigar, not of a wine', () => {
    detail = detailOf({ category: 'cigar', name: 'Robusto', vintage: null, items: [] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.getByText("Aucune dégustation de ce cigare pour l'instant.")).toBeInTheDocument();
  });

  it('a group of six full bottles has no level control: nothing can open one from here', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6 })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  // Review of L1: never a level on a line of more than one bottle, whatever is on screen.
  it('refuses a level on a line known meanwhile as more than one bottle (an offline opening merged into its group)', async () => {
    const sub = openedBottle(60, { id: 'sub', updatedAt: '2026-10-02T00:00:00.000Z' });
    detail = detailOf({ items: [sub] });
    queryClient.setQueryData(['inventory', 'product', 'p1'], detailOf({ items: [{ ...sub, quantity: 6 }] }));
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    // Refused before any request: the slider goes back to the saved level.
    await waitFor(() => expect(slider).toHaveValue('60'));
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

  // #845: a bottle just opened is at 100 %; "Pleine" still puts it back, and says so.
  it('"Pleine" on a bottle just opened (100 %) puts it back with the others, with "Annuler"', async () => {
    const { notifyUndoable } = await import('@/lib/toast');
    vi.mocked(notifyUndoable).mockClear();
    mutate.mockImplementationOnce(async () => ({ id: 'group' }));
    detail = detailOf({ items: [unit({ id: 'group', quantity: 5, cellarId: 'garage' }), openedBottle(100, { id: 'sub', parentItemId: 'group' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pleine' }));
    expect(mutate.mock.calls[0][0]).toMatchObject({ id: 'sub', patch: { fillLevel: 100, isOpened: false } });
    await waitFor(() => expect(notifyUndoable).toHaveBeenCalledWith('openedReminder.putBack.rejoined', expect.anything(), expect.any(Function)));
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

  // #837: a tasting says which bottle it was as it was when tasted, not as it is now.
  describe('the bottle of a tasting, as it was when tasted (#837)', () => {
    const entries = () => within(screen.getByTestId('family-tastings')).getAllByRole('listitem');

    it('a bottle moved after its tasting keeps the cellar it was tasted in, and says its purchase day', () => {
      detail = detailOf({
        items: [unit({ id: 'b1', quantity: 2, cellarId: 'cuisine', purchasePrice: 20, purchasedAt: '2025-03-12T00:00:00.000Z' })],
        tastings: [tasting({ itemId: 'b1', cellarId: 'garage', cellarName: 'Garage', purchasedAt: '2025-03-12T00:00:00.000Z', snapshotAt: '2025-06-01T00:00:00.000Z' })],
      });
      render(<FamilyDrawer productId="p1" onClose={() => {}} />);
      expect(entries()[0]).toHaveTextContent(/Garage · 20\s€ \/ bouteille · achat du 12\smars\s2025/);
      expect(entries()[0]).not.toHaveTextContent('Sans cave');
    });

    it('two tastings of two bottles of the wine say what tells the bottles apart', () => {
      detail = detailOf({
        items: [unit({ id: 'b1', cellarId: 'garage' }), unit({ id: 'b2', cellarId: 'garage' })],
        tastings: [
          tasting({ id: 't1', itemId: 'b1', cellarId: 'garage', cellarName: 'Garage', purchasedAt: '2025-03-12T00:00:00.000Z', snapshotAt: '2025-06-01T00:00:00.000Z' }),
          tasting({ id: 't2', itemId: 'b2', cellarId: 'garage', cellarName: 'Garage', purchasedAt: '2024-01-05T00:00:00.000Z', snapshotAt: '2025-06-01T00:00:00.000Z' }),
        ],
      });
      render(<FamilyDrawer productId="p1" onClose={() => {}} />);
      const [first, second] = entries();
      expect(first).toHaveTextContent(/achat du 12\smars\s2025/);
      expect(second).toHaveTextContent(/achat du 5\sjanv\.\s2024/);
    });

    it('a tasting whose bottle is no longer listed, or gone for good, still says which bottle it was', () => {
      detail = detailOf({
        items: [],
        tastings: [
          tasting({ id: 't1', itemId: 'trashed', cellarId: 'garage', cellarName: 'Garage', purchasedAt: '2025-03-12T00:00:00.000Z', snapshotAt: '2025-06-01T00:00:00.000Z' }),
          tasting({ id: 't2', itemId: null, cellarId: 'garage', cellarName: 'Garage', purchasedAt: '2025-03-12T00:00:00.000Z', snapshotAt: '2025-06-01T00:00:00.000Z' }),
        ],
      });
      render(<FamilyDrawer productId="p1" onClose={() => {}} />);
      for (const entry of entries()) {
        expect(entry).toHaveTextContent(/Garage · achat du 12\smars\s2025/);
        expect(entry).not.toHaveTextContent('Goûté ailleurs');
      }
    });

    it('a bottle in no cellar when tasted keeps saying so once put in one', () => {
      detail = detailOf({
        items: [unit({ id: 'b1', cellarId: 'garage' })],
        tastings: [tasting({ itemId: 'b1', cellarId: null, cellarName: null, purchasedAt: null, snapshotAt: '2025-06-01T00:00:00.000Z' })],
      });
      render(<FamilyDrawer productId="p1" onClose={() => {}} />);
      expect(entries()[0]).toHaveTextContent('Sans cave');
      expect(entries()[0]).not.toHaveTextContent('Garage');
    });

    it('a renamed cellar shows its name of now; a deleted one, its name when tasted', () => {
      detail = detailOf({
        items: [],
        tastings: [
          tasting({ id: 't1', itemId: 'b1', cellarId: 'garage', cellarName: 'Vieux garage', snapshotAt: '2025-06-01T00:00:00.000Z' }),
          tasting({ id: 't2', itemId: 'b2', cellarId: null, cellarName: 'Cave démolie', snapshotAt: '2025-06-01T00:00:00.000Z' }),
        ],
      });
      render(<FamilyDrawer productId="p1" onClose={() => {}} />);
      const [renamed, deleted] = entries();
      expect(renamed).toHaveTextContent('Garage');
      expect(renamed).not.toHaveTextContent('Vieux garage');
      expect(deleted).toHaveTextContent('Cave démolie');
    });
  });

  // Recette #471 (KO 8.4): only a tasting without any bottle was noted elsewhere.
  it('a tasting of a bottle no longer listed (in the trash) is not "tasted elsewhere"', () => {
    detail = detailOf({
      items: [unit({ id: 'b1', quantity: 2, cellarId: 'garage' })],
      tastings: [tasting({ id: 't1', itemId: 'trashed' })],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const entry = within(screen.getByTestId('family-tastings')).getByRole('listitem');
    expect(entry).not.toHaveTextContent('Goûté ailleurs');
  });

  // #471 (FEAT-109 c3, decision point 64): a guest's tasting is signed with the guest's name.
  it('a tasting noted by a guest is signed "Marie (invité)", or "Invité" without a name', () => {
    detail = detailOf({
      items: [unit({ id: 'b1', quantity: 2, cellarId: 'garage' })],
      tastings: [
        tasting({ id: 't1', itemId: 'b1', guestName: 'Marie' }),
        tasting({ id: 't2', guestName: '' }),
        tasting({ id: 't3' }),
      ],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const [named, anonymous, member] = within(screen.getByTestId('family-tastings')).getAllByRole('listitem');
    // On the bottle the guest drank: which one, then who.
    expect(named).toHaveTextContent(/Garage.* · Marie \(invité\)/);
    // Without a bottle, a guest's tasting is not "tasted elsewhere".
    expect(anonymous).toHaveTextContent('Invité');
    expect(anonymous).not.toHaveTextContent('Goûté ailleurs');
    expect(member).toHaveTextContent('Goûté ailleurs');
    expect(member).not.toHaveTextContent('nvité');
  });

  it('a wine described by nothing shows no empty "Description du vin" (recette #471)', () => {
    detail = detailOf({ items: [unit({ quantity: 2 })] });
    const { unmount } = render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.queryByText('Description du vin')).toBeNull();
    unmount();

    detail = detailOf({ region: 'Bourgogne', items: [unit({ quantity: 2 })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.getByText('Description du vin')).toBeInTheDocument();
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

  it('a line of full bottles: open, drink, move, change the price, correct the number, edit, trash (§10.3)', async () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6, cellarId: 'garage' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const [line] = screen.getAllByTestId('family-line');
    expect(await menuOf(line)).toEqual([
      "J'en ouvre une", "J'en bois une", 'Déplacer', 'Changer le prix', 'Corriger le nombre', 'Modifier', 'Mettre à la corbeille',
    ]);
  });

  // #471 (L1, ux-ui.md §10.3): one main action in the footer, before "Ajouter des bouteilles".
  it('the footer leads with "J\'en ouvre une", then "J\'en bois une" and the page\'s actions', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6, cellarId: 'garage' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} primaryAction={() => <button type="button">Ajouter des bouteilles</button>} />);
    const open = screen.getByTestId('stock-move-open');
    expect(open).toHaveAttribute('data-primary', 'true');
    expect(screen.getByTestId('stock-move-drink')).toHaveAttribute('data-primary', 'false');
    expect(open.compareDocumentPosition(screen.getByRole('button', { name: 'Ajouter des bouteilles' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a wine with no line of full bottles has no "J\'en ouvre une"', () => {
    detail = detailOf({ items: [] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    expect(screen.queryByTestId('stock-move-open')).toBeNull();
  });

  // #844 (review of #1014): "to remove only some, use Correct the number" is
  // for "Mettre à la corbeille" from the menu, never after a correction to 0.
  const PART_HINT = /qu'une partie/;
  it('"Mettre à la corbeille" from the menu says how to remove only some of the line', async () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6, cellarId: 'garage' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const [line] = screen.getAllByTestId('family-line');
    await menuOf(line);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }));
    expect(await screen.findByTestId('trash-line-dialog')).toHaveTextContent(PART_HINT);
  });

  it('the trash offered after correcting the number to 0 does not send back to "Corriger le nombre"', async () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6, cellarId: 'garage' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const [line] = screen.getAllByTestId('family-line');
    await menuOf(line);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Corriger le nombre' }));
    fireEvent.change(await screen.findByTestId('correct-quantity-input'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('radio', { name: /Erreur de saisie/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mettre ces bouteilles à la corbeille' }));
    const dialog = await screen.findByTestId('trash-line-dialog');
    expect(dialog).toHaveTextContent('Mettre ces 6 bouteilles');
    expect(dialog).not.toHaveTextContent(PART_HINT);
  });

  it('an opened bottle: finished, put back, edited or trashed from its menu (§10.3)', async () => {
    detail = detailOf({ items: [openedBottle(60, { id: 'sub' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} />);
    const [line] = screen.getAllByTestId('family-line');
    expect(await menuOf(line)).toEqual(['Je la finis', "Annuler l'ouverture", 'Modifier', 'Mettre à la corbeille']);
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

// FEAT-93: a cell of the cellar plan touched opens its wine on its line, with the cell.
describe('FamilyDrawer — opened from a cell of the plan (FEAT-93)', () => {
  const placed = () => unit({ id: 'group', quantity: 6, cellarId: 'garage', slots: [{ id: 's23', column: 2, row: 3 }, { id: 's24', column: 2, row: 4 }] });
  const slotContext = { itemId: 'group', slotId: 's23', label: 'Case C2·R3' };

  it('says which cell, leads to its line, and offers "Retirer de la case"', async () => {
    removeSlot.mockClear();
    detail = detailOf({ items: [unit({ id: 'other', quantity: 2, cellarId: 'garage' }), placed()] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    const banner = screen.getByTestId('slot-context');
    expect(banner).toHaveTextContent('Case C2·R3');
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-line-id="group"]')));
    fireEvent.click(within(banner).getByRole('button', { name: 'Retirer de la case' }));
    await waitFor(() => expect(removeSlot).toHaveBeenCalledWith({ slotId: 's23' }));
  });

  it('while open, messages keep clear of the drawer and its « Retirer de la case » (recette n°5 of #847)', async () => {
    const { useToastLayout } = await import('@/lib/toastClearance');
    function Where() {
      const layout = useToastLayout();
      return <output data-testid="toast-layout">{layout.placement}</output>;
    }
    detail = detailOf({ items: [placed()] });
    const { rerender } = render(<><Where /><FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} /></>);
    // jsdom: a drawer of no width leaves the whole window beside it — at
    // the bottom, clear of the navigation too (recette n°5 bis).
    expect(screen.getByTestId('toast-layout')).toHaveTextContent('bottom-right');
    rerender(<><Where /><FamilyDrawer productId={null} onClose={() => {}} slotContext={null} /></>);
    await waitFor(() => expect(screen.getByTestId('toast-layout')).toHaveTextContent('top-right'));
  });

  it('the removal is said, and the focus stays in the drawer (review of #855)', async () => {
    removeSlot.mockClear();
    detail = detailOf({ items: [placed()] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    fireEvent.click(within(screen.getByTestId('slot-context')).getByRole('button', { name: 'Retirer de la case' }));
    await waitFor(() => expect(screen.getByTestId('slot-removed')).toHaveTextContent('Bouteille retirée de la case.'));
    expect(document.activeElement).toBe(document.getElementById('inventory-detail-title'));
  });

  it('a cell changed on another device: says so, not "Une erreur est survenue"', async () => {
    const { notifyError } = await import('@/lib/toast');
    removeSlot.mockRejectedValueOnce(new Error('SLOT_NOT_FOUND'));
    detail = detailOf({ items: [placed()] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    fireEvent.click(within(screen.getByTestId('slot-context')).getByRole('button', { name: 'Retirer de la case' }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('cellars.grid.slotNotFound'));
  });

  it('closed, then opened again without a cell: no line is led to any more (review of #855)', async () => {
    detail = detailOf({ items: [unit({ id: 'other', quantity: 2, cellarId: 'garage' }), placed()] });
    const { rerender } = render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-line-id="group"]')));
    rerender(<FamilyDrawer productId={null} onClose={() => {}} slotContext={null} />);
    (document.activeElement as HTMLElement | null)?.blur?.();
    rerender(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={null} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.activeElement).not.toBe(document.querySelector('[data-line-id="group"]'));
    expect(document.querySelector('[data-line-id="group"]')?.getAttribute('data-ringed')).toBeNull();
  });

  it('no banner once the cell no longer holds a bottle of the line (taken out, drunk elsewhere)', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6, cellarId: 'garage', slots: [{ id: 's24', column: 2, row: 4 }] })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    expect(screen.queryByTestId('slot-context')).toBeNull();
  });

  // FEAT-93 c3 / decision #471 point 77: from a cell, the footer takes that very copy.
  it('from a full cell: "J\'en ouvre une" opens the bottle of that cell, no question', async () => {
    detail = detailOf({ items: [placed(), openedBottle(40, { id: 'o', cellarId: 'garage' })] });
    queryClient.setQueryData(['inventory', 'product', 'p1'], detail);
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    fireEvent.click(screen.getByTestId('stock-move-open'));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ id: 'group', patch: expect.objectContaining({ isOpened: true, fromSlotId: 's23' }) }));
    expect(screen.queryByText(/déjà entamée/)).toBeNull();
  });

  it('c3: the bottle opened from the cell took it along — the banner stays, "Finir l\'entamée" comes first', () => {
    detail = detailOf({
      items: [
        unit({ id: 'group', quantity: 5, cellarId: 'garage', slots: [{ id: 's24', column: 2, row: 4 }] }),
        openedBottle(100, { id: 'sub', cellarId: 'garage', parentItemId: 'group', slots: [{ id: 's23', column: 2, row: 3 }] }),
      ],
    });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    expect(screen.getByTestId('slot-context')).toHaveTextContent('Case C2·R3');
    const finish = screen.getByTestId('stock-move-finish');
    expect(finish).toHaveTextContent("Finir l'entamée");
    expect(finish).toHaveAttribute('data-primary', 'true');
  });

  it('offline: "Retirer de la case" stays visible, says why, and does nothing (FEAT-108)', async () => {
    connectivity.online = false;
    removeSlot.mockClear();
    detail = detailOf({ items: [placed()] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    const remove = within(screen.getByTestId('slot-context')).getByRole('button', { name: 'Retirer de la case' });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Disponible au retour de la connexion')).toBeInTheDocument();
    fireEvent.click(remove);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(removeSlot).not.toHaveBeenCalled();
  });

  it('review 857: a bottle put back in the cell by "Annuler" (a new slot there) keeps the banner', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6, cellarId: 'garage', slots: [{ id: 'new', column: 2, row: 3 }] })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={{ ...slotContext, at: { cellarId: 'garage', column: 2, row: 3 } }} />);
    expect(screen.getByTestId('slot-context')).toHaveTextContent('Case C2·R3');
    // The tasting of that line takes the bottle of the cell, under its slot of now.
    expect(tastingFromCell.value).toEqual({ itemId: 'group', slotId: 'new' });
  });

  // Recette n°5 (7.1): "Noter une dégustation" from a cell — the line of the cell is the bottle tasted.
  it('from a cell: the tasting presets the line of the cell, among several full lines', () => {
    detail = detailOf({ items: [unit({ id: 'other', quantity: 2, cellarId: 'garage' }), placed()] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    expect(tastingPreset.id).toBe('group');
    expect(tastingFromCell.value).toEqual({ itemId: 'group', slotId: 's23' });
  });

  it('from a full cell: the tasting presets that bottle, not the opened one elsewhere (decision 77)', () => {
    detail = detailOf({ items: [placed(), openedBottle(40, { id: 'o', cellarId: 'garage' })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={slotContext} />);
    expect(tastingPreset.id).toBe('group');
  });

  it('the same cell number in another cellar is not the cell touched', () => {
    detail = detailOf({ items: [unit({ id: 'group', quantity: 6, cellarId: 'kitchen', slots: [{ id: 'other', column: 2, row: 3 }] })] });
    render(<FamilyDrawer productId="p1" onClose={() => {}} slotContext={{ ...slotContext, at: { cellarId: 'garage', column: 2, row: 3 } }} />);
    expect(screen.queryByTestId('slot-context')).toBeNull();
    expect(tastingFromCell.value).toBeUndefined();
  });
});

