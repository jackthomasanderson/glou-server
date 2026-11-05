import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { openedBottle, product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { describeStock } from '@/lib/products/stock';
import type { LineContext } from '@/lib/products/lines';
import type { Product, ProductDetailView, ProductItem } from '@/lib/products/types';

// #471 — FEAT-103 (open, drink, smoke one copy of a line) and FEAT-104
// (which line it comes from), ux-ui.md §10.4.2-10.4.3: the drawer's footer
// actions and a line's menu, against the real hooks, the API answered by a
// stubbed fetch.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyUndoable: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
const offline = vi.hoisted(() => ({
  enqueueMutation: vi.fn(async (_qc: unknown, itemId: string, patch: Record<string, unknown>) => (
    { id: 'q1', itemId, patch, createdAt: '2026-10-05T00:00:00.000Z', expectedUpdatedAt: '', status: 'pending' }
  )),
  overlayQueuedChanges: vi.fn(),
  discardQueuedMutation: vi.fn(async () => true),
}));
// The queue itself is stubbed; what it shows (shownAfter, the queued mark) is the real thing.
vi.mock('@/lib/offline/syncEngine', async (importOriginal) => ({ ...(await importOriginal<object>()), ...offline }));
// Connectivity is probed by a GET of its own: kept out of the stubbed API.
const connectivity = vi.hoisted(() => ({ online: true as boolean | null }));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => connectivity.online }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { StockMoveActions } from '../StockMoveActions';
import { StockLineMenu } from '../StockLineMenu';

const VERSION = '2026-10-02T00:00:00.000Z';
const LATER = '2026-10-03T00:00:00.000Z';
const DETAIL_KEY = ['inventory', 'product', 'p1'];
const PRODUCTS_KEY = ['inventory', 'products'];

const ctx = (kind: LineContext['kind'] = 'bottle'): LineContext => ({
  kind,
  t: (key, options) => t(key, options),
  cellarName: (id) => ({ garage: 'Garage', kitchen: 'Cuisine' } as Record<string, string>)[id],
  formatPrice: (value) => `${value} €`,
  formatDay: (day) => day,
  formatDate: (iso) => iso.slice(0, 10),
});

/** The API: every request recorded, answered with `answer`. */
let requests: { url: string; method: string; body: Record<string, unknown> }[];
let answer: (url: string, body: Record<string, unknown>) => { status: number; body: unknown };
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(init.body as string) as Record<string, unknown> : {};
  requests.push({ url, method: init?.method ?? 'GET', body });
  const reply = answer(url, body);
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
});

let queryClient: QueryClient;
beforeEach(() => {
  connectivity.online = true;
  requests = [];
  answer = () => ({ status: 200, body: { data: {}, changed: [], removedIds: [] } });
  vi.stubGlobal('fetch', fetchMock);
  Object.values(toast).forEach((fn) => fn.mockClear());
  offline.enqueueMutation.mockClear();
  offline.discardQueuedMutation.mockClear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { vi.unstubAllGlobals(); });

const detailOf = (items: ProductItem[], over: Partial<ProductDetailView> = {}): ProductDetailView =>
  ({ ...product({ items }), tastings: [], history: [], ...over }) as ProductDetailView;

/** The wine as the drawer and the list hold it, then its footer actions. */
function drawFooter(detail: ProductDetailView, viewedCellarIds?: string[]) {
  queryClient.setQueryData(DETAIL_KEY, detail);
  queryClient.setQueryData(PRODUCTS_KEY, [{ ...detail }]);
  return render(
    <QueryClientProvider client={queryClient}>
      <StockMoveActions product={detail} ctx={ctx(detail.category === 'cigar' ? 'cigar' : 'bottle')} viewedCellarIds={viewedCellarIds} />
    </QueryClientProvider>,
  );
}

const patches = () => requests.filter((request) => request.method === 'PATCH');
const cachedDetail = () => queryClient.getQueryData<ProductDetailView>(DETAIL_KEY)!;
const cachedCard = () => queryClient.getQueryData<Product[]>(PRODUCTS_KEY)![0];

/** D8: the copy taken off a group of `from` — the sub-record (`data`), the group one less (`changed`). */
function detachAnswer(group: ProductItem, state: Partial<ProductItem>) {
  return {
    status: 200,
    body: {
      data: { ...group, id: 'sub', quantity: 1, parentItemId: group.id, updatedAt: LATER, ...state },
      changed: [{ ...group, quantity: (group.quantity ?? 1) - 1, updatedAt: LATER }],
      removedIds: [],
    },
  };
}

describe('the drawer\'s footer: "J\'en ouvre une", "J\'en bois une" (FEAT-103, FEAT-104)', () => {
  it('a wine of one line ×6: "J\'en ouvre une" opens one of it at once, without a question (FEAT-104 c1)', async () => {
    const group = unit({ id: 'g', quantity: 6, cellarId: 'garage', purchasePrice: 20, updatedAt: VERSION });
    answer = () => detachAnswer(group, { isOpened: true, fillLevel: 100, openedAt: LATER });
    drawFooter(detailOf([group]));

    const main = screen.getByTestId('stock-move-open');
    expect(main).toHaveTextContent("J'en ouvre une");
    expect(main).toHaveAttribute('data-primary', 'true');
    fireEvent.click(main);

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/g', body: { isOpened: true, fillLevel: 100, expectedUpdatedAt: VERSION } });
    // FEAT-103 c1: a group of 5 and an opened bottle; the counter stays at 6.
    await waitFor(() => expect(cachedDetail().items).toHaveLength(2));
    expect(describeStock(cachedDetail(), t).parts.join(' · ')).toBe('5 pleines · 1 entamée (100 %)');
    expect(describeStock(cachedCard(), t).units).toBe(6);
    // "1 bouteille ouverte · Annuler".
    expect(toast.notifyUndoable).toHaveBeenCalledWith('openDrink.done.open', undefined, expect.any(Function));
  });

  it('"J\'en bois une" on a line ×6 at 20 €: 5 left in stock, the bottle drunk kept, spending unchanged (FEAT-103 c2)', async () => {
    const group = unit({ id: 'g', quantity: 6, purchasePrice: 20, updatedAt: VERSION });
    answer = () => detachAnswer(group, { isOpened: true, fillLevel: 0 });
    drawFooter(detailOf([group]));

    fireEvent.click(screen.getByTestId('stock-move-drink'));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toMatchObject({ isOpened: true, fillLevel: 0 });
    await waitFor(() => expect(cachedDetail().items).toHaveLength(2));
    expect(describeStock(cachedDetail(), t).units).toBe(5);
    const spent = cachedDetail().items.reduce((sum, item) => sum + (item.purchasePrice ?? 0) * (item.quantity ?? 1), 0);
    expect(spent).toBe(120);
  });

  it('a line of one bottle: opened itself, nothing detached (FEAT-103 c3)', async () => {
    const only = unit({ id: 'one', quantity: 1, updatedAt: VERSION });
    answer = () => ({ status: 200, body: { data: { ...only, isOpened: true, fillLevel: 100, updatedAt: LATER }, changed: [], removedIds: [] } });
    drawFooter(detailOf([only]));

    fireEvent.click(screen.getByTestId('stock-move-open'));

    await waitFor(() => expect(cachedDetail().items[0]).toMatchObject({ id: 'one', isOpened: true }));
    expect(cachedDetail().items).toHaveLength(1);
  });

  it('garage ×4 and kitchen ×2: "J\'en bois une" asks which, showing both (FEAT-104 c2)', () => {
    drawFooter(detailOf([
      unit({ id: 'garage', quantity: 4, cellarId: 'garage', purchasePrice: 20, purchasedAt: '2026-01-10', updatedAt: VERSION }),
      unit({ id: 'kitchen', quantity: 2, cellarId: 'kitchen', purchasePrice: 25, purchasedAt: '2026-06-01', updatedAt: VERSION }),
    ]));

    fireEvent.click(screen.getByTestId('stock-move-drink'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Quelles bouteilles ?');
    expect(dialog).toHaveTextContent('Cuvée X');
    const choices = within(dialog).getAllByRole('radio');
    expect(choices).toHaveLength(2);
    expect(dialog).toHaveTextContent('×4 · Garage · 20 € / bouteille · 2026-01');
    expect(dialog).toHaveTextContent('×2 · Cuisine · 25 € / bouteille · 2026-06');
    expect(patches()).toHaveLength(0);
  });

  it('preselects the kitchen when the list is filtered on it, else the line bought first (FEAT-104 c3)', () => {
    const items = [
      unit({ id: 'garage', quantity: 4, cellarId: 'garage', purchasePrice: 20, purchasedAt: '2026-01-10' }),
      unit({ id: 'kitchen', quantity: 2, cellarId: 'kitchen', purchasePrice: 20, purchasedAt: '2026-06-01' }),
    ];
    const { unmount } = drawFooter(detailOf(items), ['kitchen']);
    fireEvent.click(screen.getByTestId('stock-move-open'));
    expect(screen.getByRole('radio', { checked: true })).toHaveAttribute('value', 'kitchen');
    expect(screen.getByRole('dialog')).toHaveTextContent('Dans la cave affichée');
    unmount();

    drawFooter(detailOf(items));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    expect(screen.getByRole('radio', { checked: true })).toHaveAttribute('value', 'garage');
    expect(screen.getByRole('dialog')).toHaveTextContent('Achetée en premier');
  });

  it('two lines without a purchase day: the one at 20 € before 25 €, and at the same price the larger (FEAT-104 c3)', () => {
    const { unmount } = drawFooter(detailOf([
      unit({ id: 'at25', quantity: 3, purchasePrice: 25 }),
      unit({ id: 'at20', quantity: 1, purchasePrice: 20 }),
    ]));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    expect(screen.getByRole('radio', { checked: true })).toHaveAttribute('value', 'at20');
    expect(screen.getByRole('dialog')).toHaveTextContent('La moins chère');
    unmount();

    drawFooter(detailOf([unit({ id: 'two', quantity: 2, purchasePrice: 20 }), unit({ id: 'five', quantity: 5, purchasePrice: 20 })]));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    expect(screen.getByRole('radio', { checked: true })).toHaveAttribute('value', 'five');
    expect(screen.getByRole('dialog')).toHaveTextContent('La ligne la plus nombreuse');
  });

  it('confirming the preselected line detaches a bottle of it and leaves the other line alone (FEAT-104 c4)', async () => {
    const garage = unit({ id: 'garage', quantity: 4, cellarId: 'garage', purchasePrice: 20, purchasedAt: '2026-01-10', updatedAt: VERSION });
    const kitchen = unit({ id: 'kitchen', quantity: 2, cellarId: 'kitchen', purchasePrice: 20, purchasedAt: '2026-06-01', updatedAt: VERSION });
    answer = () => detachAnswer(garage, { isOpened: true, fillLevel: 0 });
    drawFooter(detailOf([garage, kitchen]));

    fireEvent.click(screen.getByTestId('stock-move-drink'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "J'en bois une" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/garage', body: { isOpened: true, fillLevel: 0, expectedUpdatedAt: VERSION } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const items = cachedDetail().items;
    expect(items.find((item) => item.id === 'garage')?.quantity).toBe(3);
    expect(items.find((item) => item.id === 'kitchen')).toEqual(kitchen);
  });

  it('another line can be chosen instead of the preselected one', async () => {
    const garage = unit({ id: 'garage', quantity: 4, cellarId: 'garage', purchasedAt: '2026-01-10', updatedAt: VERSION });
    const kitchen = unit({ id: 'kitchen', quantity: 2, cellarId: 'kitchen', purchasedAt: '2026-06-01', updatedAt: VERSION });
    answer = () => detachAnswer(kitchen, { isOpened: true, fillLevel: 100 });
    drawFooter(detailOf([garage, kitchen]));

    fireEvent.click(screen.getByTestId('stock-move-open'));
    fireEvent.click(screen.getByRole('radio', { name: /Cuisine/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "J'en ouvre une" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].url).toBe('/api/inventory/kitchen');
  });

  it('"Annuler" puts the bottle back intact, from its own version (§10.4.6)', async () => {
    const group = unit({ id: 'g', quantity: 6, updatedAt: VERSION });
    answer = () => detachAnswer(group, { isOpened: true, fillLevel: 100 });
    drawFooter(detailOf([group]));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());

    answer = () => ({ status: 200, body: { data: { ...group, quantity: 6, updatedAt: '2026-10-04T00:00:00.000Z' }, changed: [], removedIds: ['sub'] } });
    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    await act(async () => { undo(); });

    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toMatchObject({ url: '/api/inventory/sub', body: { isOpened: false, fillLevel: 100, expectedUpdatedAt: LATER } });
    await waitFor(() => expect(cachedDetail().items).toEqual([expect.objectContaining({ id: 'g', quantity: 6 })]));
  });

  // Review of L1: a line of one drunk in place gave its grid slot back (#573).
  // FEAT-93: the cell is no column of the bottle any more — "Annuler" puts
  // the state back; the cell itself comes back with lot S2 (`placeAt`).
  it('"Annuler" a line of one drunk in its cell puts the state back, sending no coordinates', async () => {
    const only = unit({ id: 'one', quantity: 1, cellarId: 'garage', slots: [{ id: 's1', column: 2, row: 3 }], updatedAt: VERSION });
    answer = () => ({ status: 200, body: { data: { ...only, isOpened: true, fillLevel: 0, slots: [], updatedAt: LATER }, changed: [], removedIds: [] } });
    drawFooter(detailOf([only]));
    fireEvent.click(screen.getByTestId('stock-move-drink'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());

    answer = () => ({ status: 200, body: { data: { ...only, updatedAt: '2026-10-04T00:00:00.000Z' }, changed: [], removedIds: [] } });
    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    await act(async () => { undo(); });
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toMatchObject({
      url: '/api/inventory/one',
      body: { isOpened: false, fillLevel: 100, expectedUpdatedAt: LATER },
    });
    expect(patches()[1].body).not.toHaveProperty('slotColumn');
  });

  it('"Annuler" a bottle detached from a group sends no slot (the slot stayed with the group)', async () => {
    const group = unit({ id: 'g', quantity: 6, cellarId: 'garage', slots: [{ id: 's1', column: 1, row: 1 }], updatedAt: VERSION });
    answer = () => detachAnswer(group, { isOpened: true, fillLevel: 0, slots: [] });
    drawFooter(detailOf([group]));
    fireEvent.click(screen.getByTestId('stock-move-drink'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());
    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    await act(async () => { undo(); });
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body).not.toHaveProperty('slotColumn');
  });

  it('a refused write says so (by the mutation) and keeps the question open', async () => {
    const garage = unit({ id: 'garage', quantity: 4, cellarId: 'garage', updatedAt: VERSION });
    const kitchen = unit({ id: 'kitchen', quantity: 2, cellarId: 'kitchen', updatedAt: VERSION });
    answer = () => ({ status: 409, body: { error: 'CONFLICT' } });
    drawFooter(detailOf([garage, kitchen]));

    fireEvent.click(screen.getByTestId('stock-move-open'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "J'en ouvre une" }));

    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('toast.updateConflict'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(toast.notifyUndoable).not.toHaveBeenCalled();
  });

  it('without network the move waits in the offline queue, against the group\'s version: "Annuler" drops it from the queue (FEAT-108)', async () => {
    const group = unit({ id: 'g', quantity: 6, updatedAt: VERSION });
    queryClient.setQueryData(['inventory'], [{ ...group, category: 'wine', name: 'Cuvée X' }]);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    drawFooter(detailOf([group]));

    fireEvent.click(screen.getByTestId('stock-move-open'));

    await waitFor(() => expect(offline.enqueueMutation).toHaveBeenCalled());
    const [, itemId, patch, expected] = offline.enqueueMutation.mock.calls[0] as unknown as [unknown, string, Record<string, unknown>, string];
    expect([itemId, expected]).toEqual(['g', VERSION]);
    expect(patch).toMatchObject({ isOpened: true });
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalledWith('openDrink.queued.open', undefined, expect.any(Function)));
    // Nothing was sent: "Annuler" takes it out of the queue, no request.
    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    undo();
    await waitFor(() => expect(offline.discardQueuedMutation).toHaveBeenCalledWith('q1', queryClient));
  });

  it('nothing to open when no line of full bottles is left, nor anything to drink when no bottle is left', () => {
    drawFooter(detailOf([unit({ id: 'drunk', isOpened: true, fillLevel: 0 })]));
    expect(screen.queryByTestId('stock-move-open')).toBeNull();
    expect(screen.queryByTestId('stock-move-drink')).toBeNull();
  });
});

describe('cigars: "J\'en fume un" (FEAT-103 c4-c5)', () => {
  it('3 closed boxes of 25: smokes one at once, the box opened with 24 left, 74 cigars (c4)', async () => {
    const boxes = unit({ id: 'boxes', quantity: 3, cigarsPerBox: 25, updatedAt: VERSION });
    answer = () => detachAnswer(boxes, { isOpened: true, cigarsLeft: 24, openedAt: LATER });
    drawFooter(detailOf([boxes], { category: 'cigar', name: 'Robusto', vintage: null }));

    const main = screen.getByTestId('stock-move-smoke');
    expect(main).toHaveTextContent("J'en fume un");
    expect(main).toHaveAttribute('data-primary', 'true');
    expect(screen.queryByTestId('stock-move-open')).toBeNull();
    fireEvent.click(main);

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ smokeOne: true, expectedUpdatedAt: VERSION });
    await waitFor(() => expect(cachedDetail().items).toHaveLength(2));
    expect(describeStock(cachedDetail(), t).units).toBe(74);
    expect(toast.notifyUndoable).toHaveBeenCalledWith('openDrink.done.smoke', undefined, expect.any(Function));
  });

  it('4 single cigars: one smoked, 3 left (c5); "Annuler" puts it back', async () => {
    const singles = unit({ id: 'singles', quantity: 4, updatedAt: VERSION });
    answer = () => detachAnswer(singles, { isOpened: true, fillLevel: 0 });
    drawFooter(detailOf([singles], { category: 'cigar', name: 'Robusto', vintage: null }));

    fireEvent.click(screen.getByTestId('stock-move-smoke'));
    await waitFor(() => expect(cachedDetail().items).toHaveLength(2));
    expect(describeStock(cachedDetail(), t).units).toBe(3);

    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    await act(async () => { undo(); });
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toMatchObject({ url: '/api/inventory/sub', body: { isOpened: false, fillLevel: null } });
  });

  it('"Annuler" a box opened by its first cigar closes it again with all its cigars', async () => {
    const boxes = unit({ id: 'boxes', quantity: 3, cigarsPerBox: 25, updatedAt: VERSION });
    answer = () => detachAnswer(boxes, { isOpened: true, cigarsLeft: 24 });
    drawFooter(detailOf([boxes], { category: 'cigar', name: 'Robusto', vintage: null }));
    fireEvent.click(screen.getByTestId('stock-move-smoke'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());

    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    await act(async () => { undo(); });
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body).toMatchObject({ isOpened: false, fillLevel: null, cigarsLeft: 25 });
  });

  it('several lines of cigars: "Lesquels ?"', () => {
    drawFooter(detailOf([
      unit({ id: 'boxes', quantity: 3, cigarsPerBox: 25, cellarId: 'garage' }),
      unit({ id: 'singles', quantity: 4, cellarId: 'garage' }),
    ], { category: 'cigar', name: 'Robusto', vintage: null }));
    fireEvent.click(screen.getByTestId('stock-move-smoke'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Lesquels ?');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});

describe('a line\'s menu: open, drink, smoke from that very line', () => {
  const drawMenu = (item: ProductItem, kind: LineContext['kind'] = 'bottle') => {
    queryClient.setQueryData(DETAIL_KEY, detailOf([item]));
    return render(<QueryClientProvider client={queryClient}><StockLineMenu item={item} ctx={ctx(kind)} /></QueryClientProvider>);
  };
  const menuItems = () => screen.getAllByRole('menuitem').map((entry) => entry.textContent);

  it('a line of full bottles offers "J\'en ouvre une" and "J\'en bois une" first, and drinks from it without a question', async () => {
    const group = unit({ id: 'kitchen', quantity: 2, cellarId: 'kitchen', updatedAt: VERSION });
    answer = () => detachAnswer(group, { isOpened: true, fillLevel: 0 });
    drawMenu(group);

    fireEvent.click(screen.getByTestId('stock-line-menu'));
    await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0));
    expect(menuItems().slice(0, 3)).toEqual(["J'en ouvre une", "J'en bois une", 'Déplacer']);
    fireEvent.click(screen.getByRole('menuitem', { name: "J'en bois une" }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/kitchen', body: { isOpened: true, fillLevel: 0 } });
    expect(screen.queryByText('Quelles bouteilles ?')).toBeNull();
  });

  it('a line of cigars offers "J\'en fume un"; an opened bottle offers none of them but its own', async () => {
    const { unmount } = drawMenu(unit({ id: 'boxes', quantity: 3, cigarsPerBox: 25 }), 'cigar');
    fireEvent.click(screen.getByTestId('stock-line-menu'));
    await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0));
    expect(menuItems()[0]).toBe("J'en fume un");
    unmount();

    drawMenu(openedBottle(60, { id: 'sub' }));
    fireEvent.click(screen.getByTestId('stock-line-menu'));
    await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0));
    // §10.3: an opened bottle is finished or put back, never opened again.
    expect(menuItems()).toEqual(['Je la finis', "Annuler l'ouverture", 'Modifier', 'Mettre à la corbeille']);
  });

  it('offline: "Déplacer" and "Changer le prix" stay in the menu, disabled, with the reason; opening still works (FEAT-108, §10.8)', async () => {
    connectivity.online = false;
    drawMenu(unit({ id: 'g', quantity: 6, updatedAt: VERSION }));
    fireEvent.click(screen.getByTestId('stock-line-menu'));
    await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0));
    for (const name of ['Déplacer', 'Changer le prix']) {
      const entry = screen.getByRole('menuitem', { name });
      expect(entry).toHaveAttribute('aria-disabled', 'true');
      expect(entry).toHaveTextContent('Disponible au retour de la connexion');
    }
    for (const name of ["J'en ouvre une", "J'en bois une", 'Corriger le nombre']) {
      expect(screen.getByRole('menuitem', { name })).not.toHaveAttribute('aria-disabled', 'true');
    }
  });
});
