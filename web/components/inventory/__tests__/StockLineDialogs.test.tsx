import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { openedBottle, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { LineContext } from '@/lib/products/lines';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';

// #471 (W3) — ux-ui.md §10.4.4, §10.4.5, §10.4.7: the dialogs of a line of a
// wine's drawer, against the real hooks with the API answered by a stubbed fetch.

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
// The modal's frame only (no animation): what it asks is what is tested.
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

import { CorrectQuantityDialog } from '../CorrectQuantityDialog';
import { EditLineDialog } from '../EditLineDialog';
import { TrashLineDialog } from '../TrashLineDialog';

const VERSION = '2026-10-02T00:00:00.000Z';

const ctx = (kind: LineContext['kind'] = 'bottle'): LineContext => ({
  kind,
  t: (key, options) => t(key, options),
  cellarName: (id) => ({ garage: 'Garage', kitchen: 'Cuisine' } as Record<string, string>)[id],
  formatPrice: (value) => `${value} €`,
  formatMonth: (day) => day,
  formatDate: (iso) => iso.slice(0, 10),
});

/** The API: every request recorded, answered with `answer` (a D8 write by default). */
let requests: { url: string; method: string; body: unknown }[];
let answer: { status: number; body: unknown };
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  requests.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined });
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
});

let queryClient: QueryClient;
beforeEach(() => {
  requests = [];
  answer = { status: 200, body: { data: {}, changed: [], removedIds: [] } };
  vi.stubGlobal('fetch', fetchMock);
  toast.notifySuccess.mockClear();
  toast.notifyError.mockClear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { vi.unstubAllGlobals(); });

const renderIn = (ui: ReactNode) => render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

const group = (over: Partial<ProductItem> = {}) =>
  unit({ id: 'g', quantity: 6, cellarId: 'garage', purchasePrice: 20, updatedAt: VERSION, ...over });

/** Types a number the way a member does, then leaves the field. */
function typeNumber(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}
const numberField = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;
const confirmButton = (name: string | RegExp) => screen.getByRole('button', { name });

describe('CorrectQuantityDialog (FEAT-92 c3, §10.4.5)', () => {
  const open = (item: ProductItem, onTrashInstead = vi.fn(), onClose = vi.fn()) =>
    renderIn(<CorrectQuantityDialog item={item} ctx={ctx()} isOpen onClose={onClose} onTrashInstead={onTrashInstead} />);

  it('starts from the number of the line; the same number asks nothing and cannot be sent', () => {
    open(group());
    expect(numberField('correct-quantity-input')).toHaveValue(6);
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('Pour en ajouter, utilisez « Ajouter des bouteilles ».')).toBeInTheDocument();
    expect(confirmButton('Corriger')).toBeDisabled();
  });

  it('asks why once the number goes down, with no answer chosen in advance', () => {
    open(group());
    typeNumber(numberField('correct-quantity-input'), '4');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.closest('label')?.textContent)).toEqual([
      expect.stringContaining('Erreur de saisie'),
      expect.stringContaining('Cassée, offerte ou perdue'),
    ]);
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(confirmButton('Corriger')).toBeDisabled();
    expect(screen.getByText('Pour une bouteille bue, utilisez plutôt « J\'en bois une ».')).toBeInTheDocument();
  });

  it.each([
    ['Erreur de saisie', 'input_error'],
    ['Cassée, offerte ou perdue', 'written_off'],
  ])('6 → 4 "%s": sends the new number, the reason and the version shown', async (label, reason) => {
    const onClose = vi.fn();
    open(group(), vi.fn(), onClose);
    typeNumber(numberField('correct-quantity-input'), '4');
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(label) }));
    fireEvent.click(confirmButton('Corriger'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests).toEqual([{
      url: '/api/inventory/g/correct', method: 'POST',
      body: { quantity: 4, reason, expectedUpdatedAt: VERSION },
    }]);
    expect(toast.notifySuccess).toHaveBeenCalledWith('stockLine.correct.done', { from: 6, to: 4 });
  });

  it('down to 0 by an input error: offers the trash instead, nothing sent', () => {
    const onTrashInstead = vi.fn();
    open(group(), onTrashInstead);
    typeNumber(numberField('correct-quantity-input'), '0');
    fireEvent.click(screen.getByRole('radio', { name: /Erreur de saisie/ }));
    fireEvent.click(confirmButton('Mettre ces bouteilles à la corbeille'));
    expect(onTrashInstead).toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('down to 0 broken, given away or lost: the whole line leaves (written off)', async () => {
    open(group({ quantity: 2 }));
    typeNumber(numberField('correct-quantity-input'), '0');
    fireEvent.click(screen.getByRole('radio', { name: /Cassée/ }));
    fireEvent.click(confirmButton('Corriger'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toMatchObject({ quantity: 0, reason: 'written_off' });
  });

  it('never more than the line, nor a negative number', () => {
    open(group());
    for (const value of ['7', '-1', '2.5']) {
      typeNumber(numberField('correct-quantity-input'), value);
      expect(confirmButton('Corriger')).toBeDisabled();
    }
  });

  it('applies the answer (D8) to the open drawer at once: the group at 4, the 2 written off', async () => {
    const before = group();
    queryClient.setQueryData<Partial<ProductDetailView>>(['inventory', 'product', 'p1'], { id: 'p1', items: [before] });
    const writtenOff = unit({ id: 'w', quantity: 2, writtenOffAt: '2026-10-31T00:00:00.000Z', parentItemId: 'g' });
    answer = { status: 200, body: { data: writtenOff, changed: [{ ...before, quantity: 4 }], removedIds: [] } };
    open(before);
    typeNumber(numberField('correct-quantity-input'), '4');
    fireEvent.click(screen.getByRole('radio', { name: /Cassée/ }));
    fireEvent.click(confirmButton('Corriger'));

    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalled());
    const detail = queryClient.getQueryData<ProductDetailView>(['inventory', 'product', 'p1']);
    expect(detail?.items.map((item) => [item.id, item.quantity, item.writtenOffAt != null])).toEqual([['g', 4, false], ['w', 2, true]]);
  });

  it('changed meanwhile (409): says so and stays open', async () => {
    answer = { status: 409, body: { error: 'CONFLICT', data: group({ quantity: 5 }) } };
    const onClose = vi.fn();
    open(group(), vi.fn(), onClose);
    typeNumber(numberField('correct-quantity-input'), '4');
    fireEvent.click(screen.getByRole('radio', { name: /Erreur de saisie/ }));
    fireEvent.click(confirmButton('Corriger'));
    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('stockLine.errors.conflict'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('EditLineDialog (§10.3 "Modifier", #726)', () => {
  it('empties the price and the opening day of an opened bottle: both sent empty, nothing else', async () => {
    const onClose = vi.fn();
    answer = { status: 200, body: { data: { id: 'o', productId: 'p1' }, changed: [], removedIds: [] } };
    const opened = openedBottle(50, { id: 'o', purchasePrice: 20, openedAt: '2026-01-10T00:00:00.000Z', updatedAt: VERSION });
    renderIn(<EditLineDialog item={opened} ctx={ctx()} isOpen onClose={onClose} />);
    expect(confirmButton('Enregistrer')).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Prix d'une bouteille/), { target: { value: '' } });
    const openedOn = screen.getByLabelText(/Ouverte le/);
    expect(openedOn).toHaveValue('2026-01-10');
    fireEvent.change(openedOn, { target: { value: '' } });
    fireEvent.click(confirmButton('Enregistrer'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests).toEqual([{
      url: '/api/inventory/o', method: 'PATCH',
      body: { purchasePrice: null, openedAt: null, expectedUpdatedAt: VERSION },
    }]);
  });

  it('a group of full bottles: purchase day, place and location, never an opening day', async () => {
    renderIn(<EditLineDialog item={group({ purchasedAt: '2026-01-15' })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    expect(screen.getByText("S'applique aux 6 bouteilles de cette ligne.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Ouverte le/)).toBeNull();
    expect(screen.getByLabelText(/Date d'achat/)).toHaveValue('2026-01-15');

    fireEvent.change(screen.getByLabelText(/Date d'achat/), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(/Lieu d'achat/), { target: { value: 'Caviste du coin' } });
    fireEvent.change(screen.getByLabelText(/Emplacement/), { target: { value: 'Étagère du haut' } });
    fireEvent.click(confirmButton('Enregistrer'));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toEqual({
      purchasedAt: '2026-02-01', purchasePlace: 'Caviste du coin', location: 'Étagère du haut', expectedUpdatedAt: VERSION,
    });
  });
});

describe('TrashLineDialog (§10.4.7)', () => {
  it('says how many and which line, and trashes the whole line once confirmed', async () => {
    const onClose = vi.fn();
    queryClient.setQueryData<Partial<ProductDetailView>>(['inventory', 'product', 'p1'], { id: 'p1', items: [group({ quantity: 4 }), unit({ id: 'other' })] });
    answer = { status: 200, body: { data: { id: 'g' } } };
    renderIn(<TrashLineDialog item={group({ quantity: 4 })} ctx={ctx()} isOpen onClose={onClose} />);
    expect(screen.getByText('Mettre ces 4 bouteilles (Garage · 20 € / bouteille) à la corbeille ?')).toBeInTheDocument();
    expect(requests).toEqual([]);

    await act(async () => { fireEvent.click(confirmButton('Mettre à la corbeille')); });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests).toEqual([expect.objectContaining({ url: '/api/inventory/g', method: 'DELETE' })]);
    expect(toast.notifySuccess).toHaveBeenCalledWith('stockLine.trash.done', { context: 'bottle', count: 4 });
    // The line leaves the open drawer at once.
    expect(queryClient.getQueryData<ProductDetailView>(['inventory', 'product', 'p1'])?.items.map((item) => item.id)).toEqual(['other']);
  });

  it('an opened bottle is one bottle', () => {
    renderIn(<TrashLineDialog item={openedBottle(40, { cellarId: 'garage' })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Mettre cette bouteille (Garage) à la corbeille ?')).toBeInTheDocument();
  });
});
