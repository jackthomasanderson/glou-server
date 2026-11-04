import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { guestFamilies } from '@/lib/shares/guestFamilies';
import type { GuestItem } from '@/lib/shares/types';

// #471 — FEAT-109 (ux-ui.md §10.9): a guest opens, drinks or smokes one copy
// of a cellar shared with write access, sets the level of an opened bottle,
// notes a tasting — and has no action on a number, a move, a price, an
// addition nor the wine's notes. The API answered by a stubbed fetch.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyUndoable: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
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

import { GuestFamilyCard } from '../GuestFamilyCard';

const T = '2026-10-02T00:00:00.000Z';
const META = { writeCellarIds: ['garage'], cellars: [{ id: 'garage', name: 'Garage' }, { id: 'kitchen', name: 'Cuisine' }] };
const copy = (over: Partial<GuestItem> & { id: string }): GuestItem => ({
  productId: 'p1', name: 'Talbot', producer: 'Château Talbot', category: 'wine', vintage: 2018,
  quantity: 1, isOpened: false, fillLevel: null, cellarId: 'garage', createdAt: T, updatedAt: T, ...over,
});

let requests: { url: string; method: string; body: Record<string, unknown> }[];
let answer: (url: string) => { status: number; body: unknown };
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(init.body as string) as Record<string, unknown> : {};
  requests.push({ url, method: init?.method ?? 'GET', body });
  const reply = answer(url);
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
});

beforeEach(() => {
  requests = [];
  answer = () => ({ status: 200, body: { data: {} } });
  vi.stubGlobal('fetch', fetchMock);
  Object.values(toast).forEach((fn) => fn.mockClear());
  onNoteTasting.mockClear();
  onLinkGone.mockClear();
  onDrunk.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); });

const onNoteTasting = vi.fn();
const onLinkGone = vi.fn();
const onDrunk = vi.fn();

function draw(items: GuestItem[], meta = META) {
  const [family] = guestFamilies(items);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestFamilyCard family={family} token="tok" meta={meta} onNoteTasting={onNoteTasting} onLinkGone={onLinkGone} onDrunk={onDrunk} />
    </QueryClientProvider>,
  );
}

const writes = () => requests.filter((request) => request.method !== 'GET');

describe('a guest on a cellar shared with write access (FEAT-109)', () => {
  it('c1: "J\'en ouvre une" on a line ×6 opens one of it at once, through the guest route', async () => {
    draw([copy({ id: 'g', quantity: 6 })]);
    expect(screen.getByTestId('guest-family-stock')).toHaveTextContent('6 bouteilles');

    fireEvent.click(screen.getByTestId('guest-move-open'));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: '/api/guest/tok/inventory/g', method: 'PATCH', body: { isOpened: true, fillLevel: 100 } });
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());
    expect(toast.notifyUndoable.mock.calls[0][0]).toBe('openDrink.done.open');
    // Opening offers no tasting: only « Annuler ».
    expect(toast.notifyUndoable.mock.calls[0][3]).toBeUndefined();
  });

  // Decision #471 point 68: « Annuler » of the guest's own move, on the copy it detached.
  it('« Annuler » sends undo on the copy the move answered with', async () => {
    answer = (url) => (url.endsWith('/inventory/g') ? { status: 200, body: { data: { id: 'sub' } } } : { status: 200, body: { data: {} } });
    draw([copy({ id: 'g', quantity: 6 })]);
    fireEvent.click(screen.getByTestId('guest-move-drink'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());

    (toast.notifyUndoable.mock.calls[0][2] as () => void)();

    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toMatchObject({ url: '/api/guest/tok/inventory/sub', method: 'PATCH', body: { undo: true } });
  });

  it('a refused « Annuler » says it is too late', async () => {
    let calls = 0;
    answer = () => (++calls === 1 ? { status: 200, body: { data: { id: 'sub' } } } : { status: 403, body: { error: 'GUEST_UNDO_REFUSED' } });
    draw([copy({ id: 'g', quantity: 6 })]);
    fireEvent.click(screen.getByTestId('guest-move-drink'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());

    (toast.notifyUndoable.mock.calls[0][2] as () => void)();

    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('shares.guest.errors.undo'));
  });

  // Decision #471 point 70: the bottle just drunk, even the last one.
  it('after « J\'en bois une », the message offers « Noter une dégustation » on the bottle drunk', async () => {
    answer = () => ({ status: 200, body: { data: { id: 'sub' } } });
    draw([copy({ id: 'g', quantity: 1 })]);
    fireEvent.click(screen.getByTestId('guest-move-drink'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());

    const extra = toast.notifyUndoable.mock.calls[0][3] as { labelKey: string; onPress: () => void };
    expect(extra.labelKey).toBe('shares.guest.tasting.action');
    extra.onPress();
    expect(onNoteTasting).toHaveBeenCalledWith({ productId: 'p1', itemId: 'sub', wine: 'Talbot 2018' });
  });

  it('a link expired or revoked meanwhile switches the page to its "expired" screen', async () => {
    answer = () => ({ status: 403, body: { error: 'SHARE_EXPIRED_OR_REVOKED' } });
    draw([copy({ id: 'g', quantity: 6 })]);

    fireEvent.click(screen.getByTestId('guest-move-open'));

    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('shares.guest.expired'));
    expect(onLinkGone).toHaveBeenCalled();
  });

  it('"J\'en bois une" takes the line of the shared cellar, never the read-only one: no question', async () => {
    draw([copy({ id: 'kitchen', quantity: 2, cellarId: 'kitchen', purchasedAt: '2020-01-01' }), copy({ id: 'garage', quantity: 4, purchasedAt: '2026-01-01' })]);

    fireEvent.click(screen.getByTestId('guest-move-drink'));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: '/api/guest/tok/inventory/garage', body: { isOpened: true, fillLevel: 0 } });
    expect(screen.queryByText('Quelles bouteilles ?')).toBeNull();
  });

  it('several lines of the shared cellar: "Quelles bouteilles ?" with the one bought first preselected', async () => {
    draw([copy({ id: 'late', quantity: 4, purchasedAt: '2026-06-01' }), copy({ id: 'early', quantity: 2, purchasedAt: '2025-01-01' })], { ...META, writeCellarIds: ['garage'] });

    fireEvent.click(screen.getByTestId('guest-move-drink'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Achetée en premier')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: "J'en bois une" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].url).toBe('/api/guest/tok/inventory/early');
  });

  it('"J\'en fume un" for cigars sends smokeOne', async () => {
    draw([copy({ id: 'box', category: 'cigar', quantity: 3, cigarsPerBox: 25, vintage: null })]);

    fireEvent.click(screen.getByTestId('guest-move-smoke'));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({ smokeOne: true });
  });

  it('"J\'en fume un" smokes from the opened box first, even with no closed box left', async () => {
    draw([
      copy({ id: 'box', category: 'cigar', quantity: 2, cigarsPerBox: 25, vintage: null }),
      copy({ id: 'opened', category: 'cigar', quantity: 1, cigarsPerBox: 25, isOpened: true, cigarsLeft: 10, vintage: null }),
    ]);
    fireEvent.click(screen.getByTestId('guest-move-smoke'));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: '/api/guest/tok/inventory/opened', body: { smokeOne: true } });
  });

  it('an opened box alone still offers "J\'en fume un"', () => {
    draw([copy({ id: 'opened', category: 'cigar', quantity: 1, cigarsPerBox: 25, isOpened: true, cigarsLeft: 3, vintage: null })]);
    expect(screen.getByTestId('guest-move-smoke')).toBeInTheDocument();
  });

  it('sets the level of an opened bottle of the shared cellar on that bottle, never on its line', async () => {
    draw([copy({ id: 'g', quantity: 5 }), copy({ id: 'sub', isOpened: true, fillLevel: 60 })]);

    expect(screen.getAllByRole('slider')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Moitié' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: '/api/guest/tok/inventory/sub', body: { fillLevel: 50 } });
  });

  it('says why a write was refused', async () => {
    answer = () => ({ status: 409, body: { error: 'GUEST_ITEM_FINISHED' } });
    draw([copy({ id: 'g', quantity: 6 })]);

    fireEvent.click(screen.getByTestId('guest-move-open'));

    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('shares.guest.errors.finished'));
  });

  it('c3: « Noter une dégustation » on the opened bottle when there is one, else on the wine', () => {
    draw([copy({ id: 'g', quantity: 5 }), copy({ id: 'sub', isOpened: true, fillLevel: 60 })]);
    fireEvent.click(screen.getByTestId('guest-tasting'));
    expect(onNoteTasting).toHaveBeenCalledWith({ productId: 'p1', itemId: 'sub', wine: 'Talbot 2018' });
  });

  it('c2: no action to correct a number, move, reprice, add, or edit the wine or its notes', () => {
    draw([copy({ id: 'g', quantity: 6, notes: 'Notes du vin' }), copy({ id: 'sub', isOpened: true, fillLevel: 60 })]);

    expect(screen.getByText('Notes du vin')).toBeInTheDocument();
    for (const name of [/Corriger/i, /Déplacer/i, /prix/i, /Ajouter/i, /Modifier/i, /corbeille/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

// Recette #471 (lot RB): the same sequence as a member's (§10.9 → §10.4.2).
describe('a guest and the opened bottle (recette #471, decisions 68-70)', () => {
  it('only the opened bottle left: « J\'en bois une » is offered and finishes it, no « J\'en ouvre une »', async () => {
    answer = () => ({ status: 200, body: { data: { id: 'sub' } } });
    draw([copy({ id: 'sub', isOpened: true, fillLevel: 40, openedAt: T })]);

    expect(screen.queryByTestId('guest-move-open')).toBeNull();
    fireEvent.click(screen.getByTestId('guest-move-drink'));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: '/api/guest/tok/inventory/sub', body: { isOpened: true, fillLevel: 0 } });
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());
    // « Annuler » (decision 68) and « Noter une dégustation » on that very bottle (decision 70).
    expect(typeof toast.notifyUndoable.mock.calls[0][2]).toBe('function');
    expect(toast.notifyUndoable.mock.calls[0][3]).toMatchObject({ labelKey: 'shares.guest.tasting.action' });
    expect(onDrunk).toHaveBeenCalledWith({ productId: 'p1', itemId: 'sub', wine: 'Talbot 2018' });
  });

  it('an opened bottle and a full line: « C\'est elle que vous avez finie ? » — « Oui » finishes it', async () => {
    draw([copy({ id: 'g', quantity: 5 }), copy({ id: 'sub', isOpened: true, fillLevel: 60, openedAt: T })]);
    fireEvent.click(screen.getByTestId('guest-move-drink'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/C'est elle que vous avez finie/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('opened-reminder-use'));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: '/api/guest/tok/inventory/sub', body: { isOpened: true, fillLevel: 0 } });
  });

  it('« Non » drinks one of the full line', async () => {
    draw([copy({ id: 'g', quantity: 5 }), copy({ id: 'sub', isOpened: true, fillLevel: 60, openedAt: T })]);
    fireEvent.click(screen.getByTestId('guest-move-drink'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('opened-reminder-new'));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: '/api/guest/tok/inventory/g', body: { isOpened: true, fillLevel: 0 } });
  });

  it('« J\'en ouvre une » with an opened bottle: « Finir l\'entamée » writes nothing (its level is on the card)', async () => {
    draw([copy({ id: 'g', quantity: 5 }), copy({ id: 'sub', isOpened: true, fillLevel: 60, openedAt: T })]);
    fireEvent.click(screen.getByTestId('guest-move-open'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('opened-reminder-use'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes()).toHaveLength(0);
  });

  it('never offers « Pleine » on the opened bottle (decision 69): « Moitié » and « Vide » only', () => {
    draw([copy({ id: 'sub', isOpened: true, fillLevel: 60 })]);
    expect(screen.queryByRole('button', { name: 'Pleine' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Moitié' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vide' })).toBeInTheDocument();
  });

  it('opening one is no drink: nothing kept for a tasting', async () => {
    draw([copy({ id: 'g', quantity: 6 })]);
    fireEvent.click(screen.getByTestId('guest-move-open'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());
    expect(onDrunk).not.toHaveBeenCalled();
  });

  it('two lines that read the same (prices hidden) are told apart in « Quelles bouteilles ? »', async () => {
    draw([
      copy({ id: 'a', bottleSize: '75 cl', createdAt: '2026-11-03T10:00:00.000Z' }),
      copy({ id: 'b', bottleSize: '75 cl', createdAt: '2026-11-04T10:00:00.000Z' }),
    ]);
    fireEvent.click(screen.getByTestId('guest-move-drink'));
    const dialog = await screen.findByRole('dialog');
    const labels = within(dialog).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent ?? '');
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(labels.join(' | ')).toMatch(/ajout du 3 nov\. 2026.*\|.*ajout du 4 nov\. 2026/);
  });
});

describe('a guest on a cellar shared read-only (FEAT-109 c4)', () => {
  it('can neither open, drink, set a level nor note a tasting', () => {
    draw([copy({ id: 'g', quantity: 6, cellarId: 'kitchen' }), copy({ id: 'sub', isOpened: true, fillLevel: 60, cellarId: 'kitchen' })]);

    expect(screen.getByTestId('guest-family-stock')).toHaveTextContent('6 pleines · 1 entamée (60 %)');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
