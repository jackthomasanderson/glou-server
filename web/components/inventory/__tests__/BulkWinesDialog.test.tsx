import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { openedBottle, product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { Product } from '@/lib/products/types';

// #471 (FEAT-111, ux-ui.md §10.4.8): the bulk actions on the wines selected,
// against the real hook with the API answered by a stubbed fetch.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
vi.mock('@/hooks/useCellars', () => ({
  useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }, { id: 'kitchen', name: 'Cuisine' }] }),
}));
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

import { BulkWinesDialog, type BulkWinesActionName } from '../BulkWinesDialog';

let requests: { url: string; method: string; body: unknown }[];
let answer: { status: number; body: unknown };
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined });
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
});

let queryClient: QueryClient;
beforeEach(() => {
  requests = [];
  answer = { status: 200, body: { data: { wines: 3, units: 14 } } };
  vi.stubGlobal('fetch', fetchMock);
  toast.notifySuccess.mockClear();
  toast.notifyError.mockClear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Three wines, 14 bottles in the cellar (c1), one of them with a bottle already drunk (c4). */
const wines: Product[] = [
  product({ id: 'a', name: 'Alpha', items: [unit({ productId: 'a', quantity: 5, cellarId: 'garage' }), openedBottle(60, { productId: 'a' }), openedBottle(0, { productId: 'a' })] }),
  product({ id: 'b', name: 'Beta', items: [unit({ productId: 'b', quantity: 6 })] }),
  product({ id: 'c', name: 'Gamma', items: [unit({ productId: 'c', quantity: 2 })] }),
  product({ id: 'gone', name: 'Delta', items: [] }),
];

function open(action: BulkWinesActionName, selected: string[], onDone = vi.fn()) {
  render(
    <QueryClientProvider client={queryClient}>
      <BulkWinesDialog action={action} products={wines} selectedIds={new Set(selected)} cigars={false} viewedCellarIds={['garage']} onClose={vi.fn()} onDone={onDone} />
    </QueryClientProvider>,
  );
  return onDone;
}

const confirmButton = (name: string) => screen.getByRole('button', { name });

describe('BulkWinesDialog (FEAT-111)', () => {
  it('c1: "Déplacer" says "3 vins, 14 bouteilles" before validation, then moves them all to the kitchen', async () => {
    const onDone = open('move', ['a', 'b', 'c']);
    expect(screen.getByTestId('bulk-wines-summary')).toHaveTextContent('3 vins, 14 bouteilles');
    expect(confirmButton('Déplacer')).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Cuisine' }));
    fireEvent.click(confirmButton('Déplacer'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(requests).toEqual([{ url: '/api/products/bulk-move', method: 'POST', body: { productIds: ['a', 'b', 'c'], cellarId: 'kitchen' } }]);
    expect(toast.notifySuccess).toHaveBeenCalledWith('bulkWines.move.done', { units: '14 bouteilles', context: undefined });
  });

  it('c2/c4: "Mettre à la corbeille" gives the same summary; a wine without bottle is neither counted nor sent', async () => {
    const onDone = open('trash', ['a', 'b', 'c', 'gone']);
    expect(screen.getByTestId('bulk-wines-summary')).toHaveTextContent('3 vins, 14 bouteilles');
    expect(screen.getByText(/déjà bues ne sont pas concernées/)).toBeInTheDocument();

    fireEvent.click(confirmButton('Mettre à la corbeille'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(requests[0]).toEqual({ url: '/api/products/bulk-trash', method: 'POST', body: { productIds: ['a', 'b', 'c'] } });
  });

  it('c3: "Marquer comme bus" asks how many only for a wine of several bottles, 1 by default', async () => {
    const onDone = open('drink', ['b', 'c']);
    expect(screen.getByTestId('bulk-drink-count-b')).toHaveValue(1);
    expect(screen.getByTestId('bulk-drink-count-c')).toHaveValue(1);

    fireEvent.click(confirmButton('Marquer comme bus'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(requests[0]).toEqual({
      url: '/api/products/bulk-drink', method: 'POST',
      body: { items: [{ productId: 'b', count: 1, openedFirst: true }, { productId: 'c', count: 1, openedFirst: true }], cellarIds: ['garage'] },
    });
  });

  it('c3: a wine of one bottle is not asked; the opened bottle is proposed first and can be left', async () => {
    const single = product({ id: 'one', name: 'Solo', items: [unit({ productId: 'one', quantity: 1 })] });
    render(
      <QueryClientProvider client={queryClient}>
        <BulkWinesDialog action="drink" products={[...wines, single]} selectedIds={new Set(['a', 'one'])} cigars={false} onClose={vi.fn()} onDone={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('bulk-drink-count-one')).toBeNull();
    expect(screen.getByText('Sa seule bouteille en cave sera marquée comme bue.')).toBeInTheDocument();
    const openedFirst = screen.getByRole('checkbox', { name: "En commençant par l'entamée (60 %)" });
    expect(openedFirst).toBeChecked();

    fireEvent.click(openedFirst);
    fireEvent.change(screen.getByTestId('bulk-drink-count-a'), { target: { value: '2' } });
    fireEvent.click(confirmButton('Marquer comme bus'));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toEqual({ items: [{ productId: 'a', count: 2, openedFirst: false }, { productId: 'one', count: 1, openedFirst: true }] });
  });

  it('a count above the wine\'s stock cannot be sent', () => {
    open('drink', ['c']);
    fireEvent.change(screen.getByTestId('bulk-drink-count-c'), { target: { value: '3' } });
    expect(confirmButton('Marquer comme bus')).toBeDisabled();
  });

  it('a refusal is told, and nothing is closed', async () => {
    answer = { status: 400, body: { error: 'COUNT_ABOVE_STOCK' } };
    const onDone = open('trash', ['a']);
    fireEvent.click(confirmButton('Mettre à la corbeille'));
    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('bulkWines.error'));
    expect(onDone).not.toHaveBeenCalled();
  });
});
