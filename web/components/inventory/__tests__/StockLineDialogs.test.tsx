import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  useCellars: () => ({ data: [{ id: 'garage', name: 'Garage', columns: 4, rows: 3 }, { id: 'kitchen', name: 'Cuisine' }] }),
  // The plan of the cellar (SlotPicker): another line holds C4·R3.
  useCellarGrid: () => ({ data: { cellar: { id: 'garage', columns: 4, rows: 3 }, items: [{ id: 'other', slots: [{ id: 'x', column: 4, row: 3 }] }] } }),
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
import { MoveUnitsDialog } from '../MoveUnitsDialog';
import { RepriceDialog } from '../RepriceDialog';
import { EditLineDialog } from '../EditLineDialog';
import { TrashLineDialog } from '../TrashLineDialog';

const VERSION = '2026-10-02T00:00:00.000Z';

const ctx = (kind: LineContext['kind'] = 'bottle'): LineContext => ({
  kind,
  t: (key, options) => t(key, options),
  cellarName: (id) => ({ garage: 'Garage', kitchen: 'Cuisine' } as Record<string, string>)[id],
  formatPrice: (value) => `${value} €`,
  formatDay: (day) => day,
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
    // Recette #471: the reasons hold their place (disabled), so the dialog
    // does not grow under the cursor when the number goes down.
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios.every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
    expect(screen.getByText("Pour en ajouter, utilisez « Ajouter des bouteilles » avec la même date d'achat pour rejoindre cette ligne.")).toBeInTheDocument();
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
    expect(radios.every((radio) => !(radio as HTMLInputElement).disabled)).toBe(true);
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

describe('MoveUnitsDialog (FEAT-98 c1-c4, §10.4.4)', () => {
  it('"Combien déplacer ?" is preset to the whole line; 2 of 6 go to the kitchen', async () => {
    const onClose = vi.fn();
    renderIn(<MoveUnitsDialog item={group()} ctx={ctx()} isOpen onClose={onClose} />);
    expect(numberField('move-count-input')).toHaveValue(6);
    // Anywhere but the line's own cellar.
    const choices = within(screen.getByRole('radiogroup')).getAllByRole('radio');
    expect(choices.map((radio) => radio.closest('label')?.textContent)).toEqual(['Cuisine', 'Sans cave']);
    expect(confirmButton('Déplacer')).toBeDisabled();

    typeNumber(numberField('move-count-input'), '2');
    fireEvent.click(screen.getByRole('radio', { name: 'Cuisine' }));
    fireEvent.click(confirmButton('Déplacer'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests).toEqual([{ url: '/api/inventory/g/move', method: 'POST', body: { count: 2, cellarId: 'kitchen', expectedUpdatedAt: VERSION } }]);
    expect(toast.notifySuccess).toHaveBeenCalledWith('stockLine.move.done', { context: 'bottle', count: 2, cellar: 'Cuisine' });
  });

  it('cannot move more bottles than the line holds (c4)', () => {
    renderIn(<MoveUnitsDialog item={group()} ctx={ctx()} isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Cuisine' }));
    typeNumber(numberField('move-count-input'), '7');
    expect(confirmButton('Déplacer')).toBeDisabled();
    expect(screen.getByText('Un nombre entre 1 et 6')).toBeInTheDocument();
    // − / + stay within the line.
    fireEvent.click(screen.getByRole('button', { name: 'Un de moins' }));
    expect(numberField('move-count-input')).toHaveValue(5);
    typeNumber(numberField('move-count-input'), '6');
    expect(screen.getByRole('button', { name: 'Un de plus' })).toBeDisabled();
  });

  it('a line of one bottle does not ask how many', async () => {
    renderIn(<MoveUnitsDialog item={group({ quantity: 1 })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    expect(screen.queryByTestId('move-count-input')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Sans cave' }));
    fireEvent.click(confirmButton('Déplacer'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toEqual({ count: 1, cellarId: null, expectedUpdatedAt: VERSION });
  });

  it('without network: said, never pretended', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderIn(<MoveUnitsDialog item={group()} ctx={ctx()} isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Cuisine' }));
    fireEvent.click(confirmButton('Déplacer'));
    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('stockLine.errors.offline'));
    expect(toast.notifySuccess).not.toHaveBeenCalled();
  });
});

describe('RepriceDialog (FEAT-98 c5, §10.4.4)', () => {
  it('"Pour combien de bouteilles ?": the price of 2 of 6 goes from 20 € to 25 €', async () => {
    const onClose = vi.fn();
    renderIn(<RepriceDialog item={group()} ctx={ctx()} isOpen onClose={onClose} />);
    expect(screen.getByLabelText(/Pour combien de bouteilles/)).toHaveValue(6);
    const price = screen.getByLabelText(/Prix d'une bouteille/);
    expect(price).toHaveValue('20');
    expect(confirmButton('Changer le prix')).toBeDisabled();

    typeNumber(numberField('reprice-count-input'), '2');
    fireEvent.change(price, { target: { value: '25' } });
    fireEvent.click(confirmButton('Changer le prix'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests).toEqual([{ url: '/api/inventory/g/reprice', method: 'POST', body: { count: 2, purchasePrice: 25, expectedUpdatedAt: VERSION } }]);
    expect(toast.notifySuccess).toHaveBeenCalledWith('stockLine.reprice.done', { context: 'bottle', count: 2, from: '20 €', to: '25 €' });
  });

  it('takes a decimal comma, refuses more than cents', () => {
    renderIn(<RepriceDialog item={group()} ctx={ctx()} isOpen onClose={vi.fn()} />);
    const price = screen.getByLabelText(/Prix d'une bouteille/);
    fireEvent.change(price, { target: { value: '24,555' } });
    expect(confirmButton('Changer le prix')).toBeDisabled();
    fireEvent.change(price, { target: { value: '24,55' } });
    expect(confirmButton('Changer le prix')).toBeEnabled();
  });

  it('asks for boxes on a line of closed boxes of cigars', () => {
    renderIn(<RepriceDialog item={group({ cigarsPerBox: 25, quantity: 3 })} ctx={ctx('cigar')} isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Pour combien de boîtes/)).toHaveValue(3);
    expect(screen.getByLabelText(/Prix d'une boîte/)).toBeInTheDocument();
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
    // The price of full bottles is "Changer le prix" (split, history).
    expect(screen.queryByLabelText(/Prix d'une bouteille/)).toBeNull();
    expect(screen.getByLabelText(/Date d'achat/)).toHaveValue('2026-01-15');

    fireEvent.change(screen.getByLabelText(/Date d'achat/), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(/Lieu d'achat/), { target: { value: 'Caviste du coin' } });
    // Recette n°5 bis of #847: a free note, not « Emplacement » — a cell of the plan is a « case ».
    expect(screen.queryByLabelText(/Emplacement/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Repère libre (étagère, carton…)'), { target: { value: 'Étagère du haut' } });
    fireEvent.click(confirmButton('Enregistrer'));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toEqual({
      purchasedAt: '2026-02-01', purchasePlace: 'Caviste du coin', location: 'Étagère du haut', expectedUpdatedAt: VERSION,
    });
  });
});

describe('EditLineDialog — an opened bottle, review of W3a', () => {
  it('refuses a price beyond cents', () => {
    renderIn(<EditLineDialog item={openedBottle(50, { purchasePrice: 20 })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Prix d'une bouteille/), { target: { value: '24,555' } });
    expect(confirmButton('Enregistrer')).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Prix d'une bouteille/), { target: { value: '24,55' } });
    expect(confirmButton('Enregistrer')).toBeEnabled();
  });

  it('west of UTC, the opening day shown is the member\'s own, and the day typed is sent as that day', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      // Opened on 28 Feb at 22:00 in New York (03:00 UTC on 1 March).
      const opened = openedBottle(50, { id: 'o', openedAt: '2026-03-01T03:00:00.000Z', updatedAt: VERSION });
      renderIn(<EditLineDialog item={opened} ctx={ctx()} isOpen onClose={vi.fn()} />);
      const openedOn = screen.getByLabelText(/Ouverte le/);
      expect(openedOn).toHaveValue('2026-02-28');
      fireEvent.change(openedOn, { target: { value: '2026-03-05' } });
      fireEvent.click(confirmButton('Enregistrer'));
      await waitFor(() => expect(requests).toHaveLength(1));
      const sent = (requests[0].body as { openedAt: string }).openedAt;
      expect(sent).toBe('2026-03-05T05:00:00.000Z');
    } finally {
      process.env.TZ = tz;
    }
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

  // Recette #471: "×1 · ZZ Recette B" named a cellar, not the wine.
  it('names the wine above its line', () => {
    renderIn(<TrashLineDialog item={group({ quantity: 1 })} ctx={{ ...ctx(), wineName: 'Cuvée X 2020' }} isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('line-dialog-wine')).toHaveTextContent('Cuvée X 2020');
  });

  // #844 (ux-ui.md §10.4.7): the whole line goes; the dialog says how to remove only some.
  it('a line of several says how to remove only some of them', () => {
    renderIn(<TrashLineDialog item={group({ quantity: 4 })} ctx={ctx()} isOpen onClose={vi.fn()} showPartHint />);
    expect(screen.getByText("Pour n'en retirer qu'une partie, utilisez « Corriger le nombre » dans le menu de la ligne.")).toBeInTheDocument();
  });

  it('a single bottle has no part to remove: no such hint', () => {
    renderIn(<TrashLineDialog item={group({ quantity: 1 })} ctx={ctx()} isOpen onClose={vi.fn()} showPartHint />);
    expect(screen.queryByText(/qu'une partie/)).toBeNull();
  });

  it('without showPartHint (after a correction to 0, on /review): no such hint', () => {
    renderIn(<TrashLineDialog item={group({ quantity: 4 })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    expect(screen.queryByText(/qu'une partie/)).toBeNull();
  });

  it('an opened bottle is one bottle', () => {
    renderIn(<TrashLineDialog item={openedBottle(40, { cellarId: 'garage' })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Mettre cette bouteille (Garage) à la corbeille ?')).toBeInTheDocument();
  });
});

// FEAT-93 c4 (#847, lot S4): fewer copies than cells — "Quelles cases
// libérer ?" (correct, move) and "Quelles cases passent au nouveau prix ?"
// (reprice part, decision #471 point 74), exactly as many as needed.
describe('the cells a dialog names (FEAT-93 c4)', () => {
  const cells = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, column: (index % 4) + 1, row: Math.floor(index / 4) + 1 }));
  const pick = (column: number, row: number) => fireEvent.click(screen.getByTestId(`slot-pick-${column}-${row}`));

  it('c4: ×6 in 6 cells corrected to ×4 asks which 2 cells to free — exactly 2 — and sends them', async () => {
    const onClose = vi.fn();
    renderIn(<CorrectQuantityDialog item={group({ slots: cells(6) })} ctx={ctx()} isOpen onClose={onClose} onTrashInstead={vi.fn()} />);
    expect(screen.queryByTestId('slot-picker')).toBeNull();
    typeNumber(numberField('correct-quantity-input'), '4');
    fireEvent.click(screen.getByRole('radio', { name: /Erreur de saisie/ }));

    const picker = screen.getByTestId('slot-picker');
    expect(within(picker).getByText('Quelles cases libérer ?')).toBeInTheDocument();
    // Recette n°5 bis: right under the reminder, without the room kept for
    // « Rien ne reste sur cette ligne » — never shown with the plan.
    expect(screen.queryByText(/Rien ne reste sur cette ligne/)).toBeNull();
    // Only the line's cells can be chosen, on the plan of its cellar.
    expect(within(picker).getAllByRole('button')).toHaveLength(6);
    expect(within(picker).getByRole('button', { name: 'Case C1·R1' })).toHaveAttribute('aria-pressed', 'false');
    expect(confirmButton('Corriger')).toBeDisabled();
    pick(1, 1);
    expect(confirmButton('Corriger')).toBeDisabled();
    pick(2, 2);
    // A third cannot be added: exactly 2.
    pick(3, 1);
    expect(within(picker).getByRole('button', { name: 'Case C3·R1' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('slot-pick-count')).toHaveTextContent('Cases choisies : 2 sur 2');
    fireEvent.click(confirmButton('Corriger'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(requests[0]).toMatchObject({ url: '/api/inventory/g/correct', body: { quantity: 4, reason: 'input_error', slotIds: ['s1', 's6'] } });
  });

  it('review 857: the plan is numbered (columns above, rows on the left); the line\'s cells carry a dot; freeing is drawn as a loss', () => {
    renderIn(<CorrectQuantityDialog item={group({ slots: cells(6) })} ctx={ctx()} isOpen onClose={vi.fn()} onTrashInstead={vi.fn()} />);
    typeNumber(numberField('correct-quantity-input'), '4');
    const picker = screen.getByTestId('slot-picker');
    expect(within(picker).getAllByTestId('slot-pick-column').map((label) => label.textContent)).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(within(picker).getAllByTestId('slot-pick-row').map((label) => label.textContent)).toEqual(['R1', 'R2', 'R3']);
    const cell = within(picker).getByRole('button', { name: 'Case C1·R1' });
    expect(cell.querySelector('span.rounded-full')).not.toBeNull();
    expect(cell).toHaveAttribute('data-tone', 'danger');
  });

  it('no question while the copies left hold every cell, nor when the whole line leaves', () => {
    const { unmount } = renderIn(<CorrectQuantityDialog item={group({ slots: cells(2) })} ctx={ctx()} isOpen onClose={vi.fn()} onTrashInstead={vi.fn()} />);
    typeNumber(numberField('correct-quantity-input'), '4');
    expect(screen.queryByTestId('slot-picker')).toBeNull();
    unmount();
    renderIn(<CorrectQuantityDialog item={group({ slots: cells(6) })} ctx={ctx()} isOpen onClose={vi.fn()} onTrashInstead={vi.fn()} />);
    typeNumber(numberField('correct-quantity-input'), '0');
    fireEvent.click(screen.getByRole('radio', { name: /Cassée/ }));
    expect(screen.queryByTestId('slot-picker')).toBeNull();
    expect(confirmButton('Corriger')).toBeEnabled();
  });

  it('the line changed meanwhile (409 SLOTS_TO_FREE_REQUIRED): asked with the cells the API gives', async () => {
    renderIn(<CorrectQuantityDialog item={group({ slots: [] })} ctx={ctx()} isOpen onClose={vi.fn()} onTrashInstead={vi.fn()} />);
    typeNumber(numberField('correct-quantity-input'), '5');
    fireEvent.click(screen.getByRole('radio', { name: /Erreur de saisie/ }));
    answer = { status: 409, body: { error: 'SLOTS_TO_FREE_REQUIRED', details: { needed: 1, slots: [{ id: 'n1', column: 2, row: 3 }] } } };
    fireEvent.click(confirmButton('Corriger'));

    await waitFor(() => expect(screen.getByTestId('slot-picker')).toBeInTheDocument());
    expect(toast.notifyError).toHaveBeenCalledWith('stockLine.errors.slotsToFree');
    answer = { status: 200, body: { data: {}, changed: [], removedIds: [] } };
    pick(2, 3);
    fireEvent.click(confirmButton('Corriger'));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].body).toMatchObject({ quantity: 5, slotIds: ['n1'] });
  });

  it('moving 2 of ×6 in 6 cells: the 2 moved leave unplaced — which 2 cells are freed', async () => {
    renderIn(<MoveUnitsDialog item={group({ slots: cells(6) })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    typeNumber(numberField('move-count-input'), '2');
    fireEvent.click(screen.getByRole('radio', { name: 'Cuisine' }));
    expect(within(screen.getByTestId('slot-picker')).getByText('Quelles cases libérer ?')).toBeInTheDocument();
    expect(confirmButton('Déplacer')).toBeDisabled();
    pick(1, 1);
    pick(2, 1);
    fireEvent.click(confirmButton('Déplacer'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toMatchObject({ count: 2, cellarId: 'kitchen', slotIds: ['s1', 's2'] });
  });

  it('moving the whole line frees every cell without a question', () => {
    renderIn(<MoveUnitsDialog item={group({ slots: cells(6) })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Cuisine' }));
    expect(screen.queryByTestId('slot-picker')).toBeNull();
    expect(confirmButton('Déplacer')).toBeEnabled();
  });

  it('decision 74: a new price for 2 of ×6 in 5 cells takes the unplaced one first, then asks which 1 cell follows', async () => {
    renderIn(<RepriceDialog item={group({ slots: cells(5) })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    typeNumber(numberField('reprice-count-input'), '1');
    typeNumber(screen.getByTestId('reprice-price-input'), '25');
    // One copy repriced: the unplaced one, no question.
    expect(screen.queryByTestId('slot-picker')).toBeNull();
    typeNumber(numberField('reprice-count-input'), '2');
    const picker = screen.getByTestId('slot-picker');
    expect(within(picker).getByText('Quelles cases passent au nouveau prix ?')).toBeInTheDocument();
    // Nothing is lost: the cells chosen follow the new price, not drawn as freed.
    expect(within(picker).getByRole('button', { name: 'Case C1·R1' })).toHaveAttribute('data-tone', 'primary');
    expect(confirmButton('Changer le prix')).toBeDisabled();
    pick(1, 2);
    fireEvent.click(confirmButton('Changer le prix'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toMatchObject({ count: 2, purchasePrice: 25, slotIds: ['s5'] });
  });

  it('the hint matches the line: "Les non rangées ne suffisent pas" only when the line has unplaced copies (recette n°5 of #847)', () => {
    const { unmount } = renderIn(<RepriceDialog item={group({ slots: cells(5) })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    typeNumber(numberField('reprice-count-input'), '2');
    expect(screen.getByTestId('slot-picker')).toHaveTextContent('Les non rangées ne suffisent pas : choisissez la case qui passe au nouveau prix.');
    unmount();
    renderIn(<RepriceDialog item={group({ slots: cells(6) })} ctx={ctx()} isOpen onClose={vi.fn()} />);
    typeNumber(numberField('reprice-count-input'), '2');
    const picker = screen.getByTestId('slot-picker');
    expect(picker).not.toHaveTextContent('non rangées');
    expect(picker).toHaveTextContent('Toute la ligne est rangée : choisissez les 2 cases qui passent au nouveau prix. Elles restent occupées.');
  });
});
