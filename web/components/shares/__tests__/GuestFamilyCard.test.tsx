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
});
afterEach(() => { vi.unstubAllGlobals(); });

function draw(items: GuestItem[], meta = META) {
  const [family] = guestFamilies(items);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestFamilyCard family={family} token="tok" meta={meta} />
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
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('openDrink.done.open'));
    // A guest never puts a copy back: no "Annuler".
    expect(toast.notifyUndoable).not.toHaveBeenCalled();
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

  it('c3: notes a tasting on the wine', async () => {
    draw([copy({ id: 'g', quantity: 6 })]);

    fireEvent.click(screen.getByTestId('guest-tasting'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Note 4/ }));
    fireEvent.change(within(dialog).getByLabelText('Notes de dégustation'), { target: { value: 'Superbe' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: '/api/guest/tok/tastings', method: 'POST', body: { productId: 'p1', rating: 4, notes: 'Superbe' } });
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('shares.guest.tasting.done'));
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

describe('a guest on a cellar shared read-only (FEAT-109 c4)', () => {
  it('can neither open, drink, set a level nor note a tasting', () => {
    draw([copy({ id: 'g', quantity: 6, cellarId: 'kitchen' }), copy({ id: 'sub', isOpened: true, fillLevel: 60, cellarId: 'kitchen' })]);

    expect(screen.getByTestId('guest-family-stock')).toHaveTextContent('6 pleines · 1 entamée (60 %)');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
