import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
const mutate = vi.fn();
vi.mock('@/hooks/useProducts', () => ({
  useProductDetail: () => ({ data: detail, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
}));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));
vi.mock('@/hooks/useInventory', () => ({
  useUpdateInventoryItem: () => ({ mutate, isPending: false }),
  useRollbackField: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('@/hooks/useAlerts', () => ({ useToggleAlertPause: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/components/collections/CollectionPickerInline', () => ({ CollectionPickerInline: () => null }));
vi.mock('@/components/tastings/TastingForm', () => ({ TastingForm: () => null }));
vi.mock('../QrCodeModal', () => ({ QrCodeModal: () => null }));
// The drawer's frame only: its content is what is tested.
vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Drawer: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => (isOpen ? <div role="dialog">{children}</div> : null),
  DrawerContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { FamilyDrawer } from '../FamilyDrawer';

const detailOf = (over: Partial<ProductDetailView>): ProductDetailView =>
  ({ ...product(), tastings: [], history: [], ...over }) as ProductDetailView;

const tasting = (over: Partial<ProductDetailView['tastings'][number]>) => ({
  id: 't1', userId: 'user', itemId: null, productId: 'p1', guestName: null, tastedAt: '2026-10-01T00:00:00.000Z',
  context: null, rating: 4, readiness: null, notes: null, foodPairing: null, photoUrl: null, robe: null, nez: null,
  bouche: null, tanin: null, acidite: null, longueurBouche: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...over,
});

beforeEach(() => { mutate.mockReset(); });

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
