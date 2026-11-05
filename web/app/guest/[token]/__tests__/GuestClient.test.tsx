import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { todayLocalIso } from '@/lib/format';

// #471 (FEAT-109 c3, decisions 70): the guest's tasting dialog lives on the
// page — noted on the bottle drunk, even the last one whose card is gone —
// and a link that dies meanwhile switches the page to its "expired" screen.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyUndoable: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
vi.mock('@/hooks/useBrowserTabTitle', () => ({ useBrowserTabTitle: () => {} }));
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

import { GuestPageContent } from '../GuestClient';

const T = '2026-10-02T00:00:00.000Z';
const META = { id: 's1', label: 'Chez nous', expiresAt: null, hidePrices: false, hideNotes: false, cellarIds: ['garage'], writeCellarIds: ['garage'], collectionIds: [], cellars: [{ id: 'garage', name: 'Garage' }] };
const BOTTLE = { id: 'g', productId: 'p1', name: 'Talbot', producer: 'Château Talbot', category: 'wine', vintage: 2018, quantity: 1, isOpened: false, fillLevel: null, cellarId: 'garage', createdAt: T, updatedAt: T };
const OPENED = { ...BOTTLE, id: 'o', isOpened: true, fillLevel: 40, openedAt: T };

let requests: { url: string; method: string; body: Record<string, unknown> }[];
let metaStatus: number;
let inventory: unknown[];
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(init.body as string) as Record<string, unknown> : {};
  const method = init?.method ?? 'GET';
  requests.push({ url, method, body });
  const reply = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  if (url === '/api/guest/tok') return metaStatus === 200 ? reply(200, { data: META }) : reply(metaStatus, { error: 'SHARE_EXPIRED_OR_REVOKED' });
  if (url === '/api/guest/tok/inventory') return reply(200, { data: inventory });
  if (url.endsWith('/inventory/g')) {
    inventory = []; // the last bottle drunk: its wine leaves the showcase
    return reply(200, { data: { ...BOTTLE, id: 'sub', isOpened: true, fillLevel: 0 } });
  }
  if (url.endsWith('/inventory/o')) {
    inventory = [BOTTLE]; // the opened bottle finished: the full one stays
    return reply(200, { data: { ...OPENED, fillLevel: 0 } });
  }
  if (url.endsWith('/tastings')) return reply(201, { data: { id: 't1' } });
  return reply(404, { error: 'NOT_FOUND' });
});

beforeEach(() => {
  requests = [];
  metaStatus = 200;
  inventory = [BOTTLE];
  vi.stubGlobal('fetch', fetchMock);
  Object.values(toast).forEach((fn) => fn.mockClear());
});
afterEach(() => { vi.unstubAllGlobals(); });

const draw = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <GuestPageContent token="tok" />
  </QueryClientProvider>,
);

describe('GuestPageContent', () => {
  it('notes the tasting on the last bottle just drunk, after its card is gone (decision 70)', async () => {
    draw();
    fireEvent.click(await screen.findByTestId('guest-move-drink'));
    await waitFor(() => expect(toast.notifyUndoable).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('guest-family')).toBeNull());

    (toast.notifyUndoable.mock.calls[0][3] as { onPress: () => void }).onPress();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Note 5/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true));
    expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      url: '/api/guest/tok/tastings', body: { productId: 'p1', itemId: 'sub', rating: 5 },
    });
    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('shares.guest.tasting.done'));
  });

  // Recette #471 (lot RB, point 1): the 5-second message alone was missed —
  // the page keeps offering the tasting of the bottle just drunk.
  it('keeps offering « Noter une dégustation » on the last bottle drunk once its message is gone; dated today', async () => {
    draw();
    fireEvent.click(await screen.findByTestId('guest-move-drink'));
    await waitFor(() => expect(screen.queryByTestId('guest-family')).toBeNull());

    const offer = await screen.findByTestId('guest-just-drunk');
    expect(offer).toHaveTextContent('Vous venez de boire une bouteille de Talbot 2018.');
    fireEvent.click(within(offer).getByTestId('guest-just-drunk-tasting'));

    const dialog = await screen.findByRole('dialog');
    // Point 5: the day is today by default, as in the member's form.
    expect(within(dialog).getByDisplayValue(todayLocalIso())).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      url: '/api/guest/tok/tastings', body: { productId: 'p1', itemId: 'sub', tastedAt: todayLocalIso() },
    }));
    // Noted: the offer is gone.
    await waitFor(() => expect(screen.queryByTestId('guest-just-drunk')).toBeNull());
  });

  // Acceptance run v3 of #471: « C'est elle que vous avez finie ? Oui », then
  // « Noter une dégustation » on the card: the tasting went on the wine alone,
  // and the offer of the page stayed once it was noted.
  it('a tasting noted from the card right after finishing a bottle goes on that bottle; the offer goes away', async () => {
    inventory = [OPENED, BOTTLE];
    draw();
    fireEvent.click(await screen.findByTestId('guest-move-drink'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui' }));
    await screen.findByTestId('guest-just-drunk');
    await waitFor(() => expect(screen.getAllByTestId('guest-family-line')).toHaveLength(1));

    fireEvent.click(screen.getByTestId('guest-tasting'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      url: '/api/guest/tok/tastings', body: { productId: 'p1', itemId: 'o' },
    }));
    await waitFor(() => expect(screen.queryByTestId('guest-just-drunk')).toBeNull());
  });

  it('the offer goes away once dismissed', async () => {
    draw();
    fireEvent.click(await screen.findByTestId('guest-move-drink'));
    const offer = await screen.findByTestId('guest-just-drunk');
    fireEvent.click(within(offer).getByRole('button', { name: 'Masquer ce message' }));
    expect(screen.queryByTestId('guest-just-drunk')).toBeNull();
  });

  it('shows the access badges below the top bar, out of the messages\' way (point 6)', async () => {
    draw();
    const access = await screen.findByTestId('guest-access');
    expect(within(access).getByText('Lecture/écriture partielle')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).parentElement?.parentElement).not.toHaveTextContent('Lecture/écriture partielle');
  });

  it('switches to the "expired" screen when a write finds the link revoked meanwhile', async () => {
    draw();
    const drink = await screen.findByTestId('guest-move-drink');
    metaStatus = 403;
    fetchMock.mockImplementationOnce(async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? 'GET', body: {} });
      return new Response(JSON.stringify({ error: 'SHARE_EXPIRED_OR_REVOKED' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    });
    fireEvent.click(drink);

    expect(await screen.findByText('Ce lien de partage a expiré ou a été révoqué.')).toBeInTheDocument();
  });
});
