import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { openedBottle, product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { describeStock } from '@/lib/products/stock';
import type { LineContext } from '@/lib/products/lines';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';

// #471 — FEAT-105 (the reminder of the opened bottle) and FEAT-106 c2
// ("Annuler l'ouverture", "garder la dégustation"), ux-ui.md §10.4.2-10.4.3,
// §10.4.6: the drawer's footer and a line's menu, against the real hooks,
// the API answered by a stubbed fetch.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyUndoable: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
const offline = vi.hoisted(() => ({ enqueueMutation: vi.fn(async () => undefined), overlayQueuedChanges: vi.fn() }));
vi.mock('@/lib/offline/syncEngine', () => offline);
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
import { ReviewLineActions } from '../ReviewLineActions';

const VERSION = '2026-10-02T00:00:00.000Z';
const LATER = '2026-10-03T00:00:00.000Z';
const DETAIL_KEY = ['inventory', 'product', 'p1'];
const PRODUCTS_KEY = ['inventory', 'products'];

const ctx = (kind: LineContext['kind'] = 'bottle'): LineContext => ({
  kind,
  t: (key, options) => t(key, options),
  cellarName: (id) => ({ garage: 'Garage', kitchen: 'Cuisine' } as Record<string, string>)[id],
  formatPrice: (value) => `${value} €`,
  formatMonth: (day) => day.slice(0, 7),
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
  requests = [];
  answer = () => ({ status: 200, body: { data: {}, changed: [], removedIds: [] } });
  vi.stubGlobal('fetch', fetchMock);
  Object.values(toast).forEach((fn) => fn.mockClear());
  offline.enqueueMutation.mockClear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { vi.unstubAllGlobals(); });

const detailOf = (items: ProductItem[], over: Partial<ProductDetailView> = {}): ProductDetailView =>
  ({ ...product({ items }), tastings: [], history: [], ...over }) as ProductDetailView;

const onFinishOpened = vi.fn();
beforeEach(() => onFinishOpened.mockClear());

/** The wine as the drawer and the list hold it, then its footer actions. */
function drawFooter(detail: ProductDetailView) {
  queryClient.setQueryData(DETAIL_KEY, detail);
  queryClient.setQueryData(PRODUCTS_KEY, [{ ...detail }]);
  return render(
    <QueryClientProvider client={queryClient}>
      <StockMoveActions product={detail} ctx={ctx(detail.category === 'cigar' ? 'cigar' : 'bottle')} onFinishOpened={onFinishOpened} />
    </QueryClientProvider>,
  );
}

/** A line's menu in the drawer of `detail`. */
function drawMenu(item: ProductItem, detail: ProductDetailView) {
  queryClient.setQueryData(DETAIL_KEY, detail);
  queryClient.setQueryData(PRODUCTS_KEY, [{ ...detail }]);
  return render(
    <QueryClientProvider client={queryClient}>
      <StockLineMenu item={item} ctx={ctx(detail.category === 'cigar' ? 'cigar' : 'bottle')} product={detail} onFinishOpened={onFinishOpened} />
    </QueryClientProvider>,
  );
}

async function chooseInMenu(name: string) {
  fireEvent.click(screen.getByTestId('stock-line-menu'));
  await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

const reminder = () => screen.getByTestId('opened-reminder-dialog');
const cigar = { category: 'cigar' as const, name: 'Robusto', vintage: null };

const patches = () => requests.filter((request) => request.method === 'PATCH');
const cachedDetail = () => queryClient.getQueryData<ProductDetailView>(DETAIL_KEY)!;

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

/** A write on one copy itself (an opened bottle finished, a cigar smoked out of an opened box). */
const ownAnswer = (item: ProductItem, state: Partial<ProductItem>) => ({
  status: 200, body: { data: { ...item, updatedAt: LATER, ...state }, changed: [], removedIds: [] },
});

describe('the reminder of the opened bottle (FEAT-105)', () => {
  const group = () => unit({ id: 'g', quantity: 5, cellarId: 'garage', purchasePrice: 20, updatedAt: VERSION });
  const opened = () => openedBottle(60, { id: 'sub', cellarId: 'garage', purchasePrice: 20, updatedAt: VERSION });

  it('"J\'en ouvre une" with a bottle opened at 60 %: reminded with that level, before anything is opened (c1)', () => {
    drawFooter(detailOf([group(), opened()]));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    expect(reminder()).toHaveTextContent('Une bouteille est déjà entamée (60 %).');
    expect(within(reminder()).getByTestId('opened-reminder-use')).toHaveTextContent("Finir l'entamée");
    expect(within(reminder()).getByTestId('opened-reminder-new')).toHaveTextContent('En ouvrir une nouvelle');
    expect(patches()).toHaveLength(0);
  });

  it('"Finir l\'entamée" opens nothing and leads to the opened bottle (c2)', () => {
    drawFooter(detailOf([group(), opened()]));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    fireEvent.click(within(reminder()).getByTestId('opened-reminder-use'));
    expect(patches()).toHaveLength(0);
    expect(onFinishOpened).toHaveBeenCalledWith(expect.objectContaining({ id: 'sub' }));
    expect(screen.queryByTestId('opened-reminder-dialog')).toBeNull();
  });

  it('"En ouvrir une nouvelle" opens one of the group: the wine then has two opened bottles (c2)', async () => {
    const full = group();
    answer = () => detachAnswer(full, { isOpened: true, fillLevel: 100, openedAt: LATER });
    drawFooter(detailOf([full, openedBottle(60, { id: 'first', updatedAt: VERSION })]));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    fireEvent.click(within(reminder()).getByTestId('opened-reminder-new'));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/g', body: { isOpened: true, fillLevel: 100 } });
    await waitFor(() => expect(cachedDetail().items).toHaveLength(3));
    expect(describeStock(cachedDetail(), t).parts.join(' · ')).toBe('4 pleines · 2 entamées');
  });

  it('"En ouvrir une nouvelle" on a wine of two lines then asks "Quelles bouteilles ?"', () => {
    drawFooter(detailOf([
      unit({ id: 'garage', quantity: 4, cellarId: 'garage', purchasedAt: '2026-01-10' }),
      unit({ id: 'kitchen', quantity: 2, cellarId: 'kitchen', purchasedAt: '2026-06-01' }),
      opened(),
    ]));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    fireEvent.click(within(reminder()).getByTestId('opened-reminder-new'));
    expect(screen.getByRole("dialog")).toHaveTextContent('Quelles bouteilles ?');
    expect(patches()).toHaveLength(0);
  });

  it('several opened bottles are all listed with their level, the oldest preselected', () => {
    drawFooter(detailOf([
      group(),
      openedBottle(30, { id: 'recent', openedAt: '2026-03-01T00:00:00.000Z' }),
      openedBottle(80, { id: 'oldest', openedAt: '2026-01-05T00:00:00.000Z' }),
    ]));
    fireEvent.click(screen.getByTestId('stock-move-open'));
    expect(reminder()).toHaveTextContent('2 bouteilles sont déjà entamées.');
    const radios = within(reminder()).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(reminder()).toHaveTextContent('80 %');
    expect(reminder()).toHaveTextContent('30 %');
    fireEvent.click(radios[1]);
    fireEvent.click(within(reminder()).getByTestId('opened-reminder-use'));
    expect(onFinishOpened).toHaveBeenCalledWith(expect.objectContaining({ id: 'recent' }));
  });

  it('"J\'en bois une": "C\'est elle que vous avez finie ?" — "Oui" finishes the opened one, the group intact (c5)', async () => {
    const sub = opened();
    answer = () => ownAnswer(sub, { fillLevel: 0 });
    drawFooter(detailOf([group(), sub]));
    fireEvent.click(screen.getByTestId('stock-move-drink'));
    expect(reminder()).toHaveTextContent("Une bouteille est déjà entamée (60 %). C'est elle que vous avez finie ?");
    fireEvent.click(within(reminder()).getByRole('button', { name: 'Oui' }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/sub', body: { isOpened: true, fillLevel: 0, expectedUpdatedAt: VERSION } });
    // No opened bottle left, the 5 full ones untouched.
    await waitFor(() => expect(describeStock(cachedDetail(), t).parts.join(' · ')).toBe('5 bouteilles'));
    expect(cachedDetail().items.find((item) => item.id === 'g')?.quantity).toBe(5);
  });

  it('"Non" drinks a full one instead (c5)', async () => {
    const full = group();
    answer = () => detachAnswer(full, { isOpened: true, fillLevel: 0 });
    drawFooter(detailOf([full, opened()]));
    fireEvent.click(screen.getByTestId('stock-move-drink'));
    fireEvent.click(within(reminder()).getByRole('button', { name: 'Non' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/g', body: { isOpened: true, fillLevel: 0 } });
  });

  it('without an opened bottle, neither opening nor drinking reminds of anything (c5)', async () => {
    const full = group();
    answer = () => detachAnswer(full, { isOpened: true, fillLevel: 0 });
    drawFooter(detailOf([full]));
    fireEvent.click(screen.getByTestId('stock-move-drink'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(screen.queryByTestId('opened-reminder-dialog')).toBeNull();
  });

  it('only an opened bottle left: "J\'en bois une" is the main action and finishes it at once; "Annuler" gives its level back', async () => {
    const sub = opened();
    answer = () => ownAnswer(sub, { fillLevel: 0 });
    drawFooter(detailOf([sub]));
    expect(screen.queryByTestId('stock-move-open')).toBeNull();
    const main = screen.getByTestId('stock-move-drink');
    expect(main).toHaveAttribute('data-primary', 'true');
    fireEvent.click(main);

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(screen.queryByTestId('opened-reminder-dialog')).toBeNull();
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/sub', body: { isOpened: true, fillLevel: 0 } });
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalledWith('openDrink.done.drink', undefined, expect.any(Function)));
    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    await act(async () => { undo(); });
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toMatchObject({ url: '/api/inventory/sub', body: { isOpened: true, fillLevel: 60, expectedUpdatedAt: LATER } });
  });

  it('a line\'s "J\'en ouvre une" reminds of the opened bottle too, then opens from that very line', async () => {
    const full = group();
    answer = () => detachAnswer(full, { isOpened: true, fillLevel: 100 });
    drawMenu(full, detailOf([full, opened()]));
    await chooseInMenu("J'en ouvre une");
    expect(reminder()).toHaveTextContent('Une bouteille est déjà entamée (60 %).');
    fireEvent.click(within(reminder()).getByTestId('opened-reminder-new'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].url).toBe('/api/inventory/g');
    expect(screen.queryByTestId('which-bottles-dialog')).toBeNull();
  });

  it('an opened bottle\'s "Je la finis" finishes it, without a question', async () => {
    const sub = opened();
    answer = () => ownAnswer(sub, { fillLevel: 0 });
    drawMenu(sub, detailOf([group(), sub]));
    await chooseInMenu('Je la finis');
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/sub', body: { isOpened: true, fillLevel: 0 } });
    expect(screen.queryByTestId('opened-reminder-dialog')).toBeNull();
  });
});

describe('cigars: "J\'en fume un" with an opened box (FEAT-105 c4)', () => {
  const box = () => unit({ id: 'box', isOpened: true, cigarsPerBox: 25, cigarsLeft: 10, cellarId: 'garage', openedAt: '2026-10-01T00:00:00.000Z', updatedAt: VERSION });
  const closed = () => unit({ id: 'closed', quantity: 2, cigarsPerBox: 25, cellarId: 'garage', updatedAt: VERSION });

  it('an opened box of 10 and two closed boxes of 25: asked, "Dans la boîte entamée" leaves 9 and the closed boxes alone', async () => {
    const opened = box();
    answer = () => ownAnswer(opened, { cigarsLeft: 9 });
    drawFooter(detailOf([closed(), opened], cigar));
    fireEvent.click(screen.getByTestId('stock-move-smoke'));
    expect(reminder()).toHaveTextContent('Dans la boîte entamée (10 restants) ou en ouvrir une nouvelle ?');
    // No answer imposed: both look alike.
    expect(within(reminder()).getByTestId('opened-reminder-use')).toHaveTextContent('Dans la boîte entamée');
    expect(within(reminder()).getByTestId('opened-reminder-new')).toHaveTextContent('En ouvrir une nouvelle');
    fireEvent.click(within(reminder()).getByTestId('opened-reminder-use'));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/box', body: { smokeOne: true } });
    await waitFor(() => expect(describeStock(cachedDetail(), t).units).toBe(59));
    expect(cachedDetail().items.find((item) => item.id === 'closed')?.quantity).toBe(2);
  });

  it('"En ouvrir une nouvelle" opens a closed box', async () => {
    const boxes = closed();
    answer = () => detachAnswer(boxes, { isOpened: true, cigarsLeft: 24 });
    drawFooter(detailOf([boxes, box()], cigar));
    fireEvent.click(screen.getByTestId('stock-move-smoke'));
    fireEvent.click(within(reminder()).getByTestId('opened-reminder-new'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/closed', body: { smokeOne: true } });
  });

  it('only an opened box left: "J\'en fume un" smokes in it at once; "Annuler" gives the cigar back', async () => {
    const opened = box();
    answer = () => ownAnswer(opened, { cigarsLeft: 9 });
    drawFooter(detailOf([opened], cigar));
    fireEvent.click(screen.getByTestId('stock-move-smoke'));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(screen.queryByTestId('opened-reminder-dialog')).toBeNull();
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/box', body: { smokeOne: true } });
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());
    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    await act(async () => { undo(); });
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body).toMatchObject({ isOpened: true, cigarsLeft: 10 });
  });

  it('an opened box\'s menu smokes in that box', async () => {
    const opened = box();
    answer = () => ownAnswer(opened, { cigarsLeft: 9 });
    drawMenu(opened, detailOf([closed(), opened], cigar));
    await chooseInMenu("J'en fume un");
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toMatchObject({ url: '/api/inventory/box', body: { smokeOne: true } });
  });
});

describe('"Annuler l\'ouverture" (FEAT-106 c1-c2, ux-ui.md §10.4.6)', () => {
  const group = () => unit({ id: 'g', quantity: 5, cellarId: 'garage', purchasePrice: 20, updatedAt: VERSION });
  const opened = () => openedBottle(60, { id: 'sub', parentItemId: 'g', cellarId: 'garage', purchasePrice: 20, updatedAt: VERSION });
  /** K: the bottle absorbed by its group, ×5 → ×6. */
  const rejoin = (full: ProductItem) => ({
    status: 200, body: { data: { ...full, quantity: 6, updatedAt: LATER }, changed: [], removedIds: ['sub'] },
  });

  it('puts the bottle back closed and full: the group is ×6 again, "Bouteille remise avec les autres (Garage · 20 €)"', async () => {
    const full = group();
    answer = () => rejoin(full);
    drawMenu(opened(), detailOf([full, opened()]));
    await chooseInMenu("Annuler l'ouverture");

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({ url: '/api/inventory/sub', method: 'PATCH', body: { isOpened: false, fillLevel: 100, expectedUpdatedAt: VERSION } });
    await waitFor(() => expect(cachedDetail().items.map((item) => [item.id, item.quantity])).toEqual([['g', 6]]));
    expect(toast.notifyUndoable).toHaveBeenCalledWith(
      'openedReminder.putBack.rejoined', { line: 'Garage · 20 € / bouteille' }, expect.any(Function),
    );
    expect(t('openedReminder.putBack.rejoined', { line: 'Garage · 20 € / bouteille' })).toBe('Bouteille remise avec les autres (Garage · 20 € / bouteille)');
  });

  it('"Annuler" opens it again from its group, then sets its level on that one bottle only', async () => {
    const full = group();
    let call = 0;
    answer = () => {
      call += 1;
      if (call === 1) return rejoin(full);
      if (call === 2) return detachAnswer({ ...full, quantity: 6, updatedAt: LATER }, { id: 'sub2', isOpened: true, fillLevel: 100, openedAt: '2026-02-01T00:00:00.000Z' });
      return ownAnswer(unit({ id: 'sub2', isOpened: true, fillLevel: 100 }), { fillLevel: 60 });
    };
    drawMenu(opened(), detailOf([full, opened()]));
    await chooseInMenu("Annuler l'ouverture");
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());
    const undo = toast.notifyUndoable.mock.calls[0][2] as () => void;
    await act(async () => { undo(); });

    await waitFor(() => expect(patches()).toHaveLength(3));
    expect(patches()[1]).toMatchObject({ url: '/api/inventory/g', body: { isOpened: true, fillLevel: 100, openedAt: '2026-02-01T00:00:00.000Z' } });
    // Never a level on the group: only on the bottle taken off it.
    expect(patches()[2]).toMatchObject({ url: '/api/inventory/sub2', body: { fillLevel: 60 } });
  });

  it('its line of origin gone: "Bouteille remise en cave", a line of one', async () => {
    const sub = openedBottle(60, { id: 'sub', updatedAt: VERSION });
    answer = () => ownAnswer(sub, { isOpened: false, fillLevel: 100, openedAt: null, parentItemId: null });
    drawMenu(sub, detailOf([sub]));
    await chooseInMenu("Annuler l'ouverture");
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalledWith('openedReminder.putBack.alone', undefined, expect.any(Function)));
  });

  it('a tasting noted on it: asked "La garder ?" without an error message; kept, it is put back with the answer (c2)', async () => {
    const full = group();
    answer = (_url, body) => ('keepTastings' in body ? rejoin(full) : { status: 409, body: { error: 'TASTINGS_ON_ITEM' } });
    drawMenu(opened(), detailOf([full, opened()]));
    await chooseInMenu("Annuler l'ouverture");

    const dialog = await screen.findByTestId('keep-tasting-dialog');
    expect(dialog).toHaveTextContent('Une dégustation a été notée sur cette bouteille.');
    expect(toast.notifyError).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Garder la dégustation' }));

    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body).toEqual({ isOpened: false, fillLevel: 100, keepTastings: true, expectedUpdatedAt: VERSION });
    await waitFor(() => expect(screen.queryByTestId('keep-tasting-dialog')).toBeNull());
  });

  it('"Ne pas la garder" sends keepTastings: false; "Annuler" leaves the bottle opened', async () => {
    const full = group();
    answer = (_url, body) => ('keepTastings' in body ? rejoin(full) : { status: 409, body: { error: 'TASTINGS_ON_ITEM' } });
    const { unmount } = drawMenu(opened(), detailOf([full, opened()]));
    await chooseInMenu("Annuler l'ouverture");
    fireEvent.click(within(await screen.findByTestId('keep-tasting-dialog')).getByRole('button', { name: 'Ne pas la garder' }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1].body).toMatchObject({ keepTastings: false });
    unmount();

    requests = [];
    drawMenu(opened(), detailOf([full, opened()]));
    await chooseInMenu("Annuler l'ouverture");
    fireEvent.click(within(await screen.findByTestId('keep-tasting-dialog')).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByTestId('keep-tasting-dialog')).toBeNull());
    expect(patches()).toHaveLength(1);
    expect(cachedDetail().items.some((item) => item.id === 'sub')).toBe(true);
  });
});

describe('a line "à vérifier" in the drawer: "C\'est bon" / "Corriger le nombre" (ux-ui.md §10.3)', () => {
  it('"C\'est bon" clears the mark of that line', async () => {
    const guessed = unit({ id: 'g', quantity: 5, needsReview: true });
    answer = () => ({ status: 200, body: { data: { ...guessed, needsReview: false } } });
    queryClient.setQueryData(DETAIL_KEY, detailOf([guessed]));
    render(<QueryClientProvider client={queryClient}><ReviewLineActions item={guessed} ctx={ctx()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: "C'est bon" }));
    await waitFor(() => expect(requests).toEqual([{ url: '/api/inventory/g/review-ok', method: 'POST', body: {} }]));
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('familyDrawer.review.confirmed'));
  });

  it('"Corriger le nombre" opens the correction of that line', () => {
    const guessed = unit({ id: 'g', quantity: 5, needsReview: true });
    render(<QueryClientProvider client={queryClient}><ReviewLineActions item={guessed} ctx={ctx()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Corriger le nombre' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
