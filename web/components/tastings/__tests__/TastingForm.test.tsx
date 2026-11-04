import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import type { InventoryItem } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import type { TastingNote } from '@/lib/tastings/types';
import { tastingToFormValues } from '@/lib/tastings/formValues';

// #642: editing a tasting showed its perceived maturity and expert grid empty,
// saving lost the maturity, and any re-render of the page (a background
// refetch) reset what was being typed.
// #595 / #586: the stock question after a tasting put an opened bottle back
// to 50 %, and emptied a whole cigar box for one smoked cigar.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.count !== undefined ? `${k}|${o.count}` : k), i18n: { language: 'fr' } }),
}));

let inventory: InventoryItem[] = [];
const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const inventoryUpdate = vi.fn();
// The tasted item's latest stock, as the inventory lookup resolves it.
let lookedUp: InventoryItem[] = [];
const lookUpItem = vi.fn(async (id: string) => lookedUp.find((i) => i.id === id));

vi.mock('@/hooks/useTastings', () => ({
  useCreateTasting: () => ({ mutateAsync: createMutateAsync, isPending: false, error: null }),
  useUpdateTasting: () => ({ mutateAsync: updateMutateAsync, isPending: false, error: null }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: inventory }),
  useUpdateInventoryItem: () => ({ mutateAsync: inventoryUpdate, isPending: false }),
  useInventoryItemLookup: () => lookUpItem,
  REATTACH_REFUSALS: { NOTHING_LEFT_TO_SMOKE: 'toast.nothingLeftToSmoke' },
}));
// #471 (FEAT-107): the form lists wines (families) with their bottles in stock.
let products: Product[] | undefined;
const productsOf = new WeakMap<InventoryItem[], Product[]>();
/** One wine per item given, holding that item as its only line (cached: a stable list per render). */
function productsFrom(items: InventoryItem[]): Product[] {
  if (!productsOf.has(items)) {
    productsOf.set(items, items.map((unit) => ({
      id: `p-${unit.id}`, name: unit.name, producer: unit.producer, category: unit.category, vintage: null, format: null,
      items: [{ cellarId: null, deletedAt: null, writtenOffAt: null, fillLevel: null, cigarsLeft: null, cigarsPerBox: null,
        quantity: 1, purchasedAt: null, productId: `p-${unit.id}`, ...unit, createdAt: unit.createdAt ?? '2026-01-01' }],
    }) as unknown as Product));
  }
  return productsOf.get(items)!;
}
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ data: products ?? productsFrom(inventory) }) }));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'c1', name: 'Garage' }] }) }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => true }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('../ServiceRecommendations', () => ({ ServiceRecommendations: () => null }));
vi.mock('@/components/ui/DiscardChangesDialog', () => ({ DiscardChangesDialog: () => null }));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));

interface FieldProps {
  label?: string;
  value?: string | number | null;
  name?: string;
  type?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onValueChange?: (v: string) => void;
  onBlur?: () => void;
}

vi.mock('@heroui/react', async () => {
  const { forwardRef } = await vi.importActual<typeof import('react')>('react');
  const Input = forwardRef<HTMLInputElement, FieldProps>(function Input({ label, value, name, type, onChange, onValueChange, onBlur }, ref) {
    return (
      <input
        ref={ref}
        aria-label={label}
        name={name}
        type={type ?? 'text'}
        value={value ?? ''}
        onChange={(e) => { onChange?.(e); onValueChange?.(e.target.value); }}
        onBlur={onBlur}
      />
    );
  });
  const Textarea = forwardRef<HTMLTextAreaElement, FieldProps>(function Textarea({ label, value, name, onChange, onBlur }, ref) {
    return <textarea ref={ref} aria-label={label} name={name} value={value ?? ''} onChange={(e) => onChange?.(e)} onBlur={onBlur} />;
  });
  return {
    Button: ({ children, onPress, onClick, type, isDisabled, 'aria-label': ariaLabel }: {
      children?: ReactNode; onPress?: () => void; onClick?: () => void; type?: 'button' | 'submit';
      isDisabled?: boolean; 'aria-label'?: string;
    }) => (
      <button type={type ?? 'button'} aria-label={ariaLabel} disabled={isDisabled} onClick={onPress ?? onClick}>{children}</button>
    ),
    Input,
    Textarea,
    // A native select: each SelectItem child becomes an option keyed like it.
    Select: ({ label, selectedKeys, onSelectionChange, children }: {
      label?: string; selectedKeys?: Iterable<string>; onSelectionChange: (keys: Set<string>) => void; children?: ReactElement | ReactElement[];
    }) => (
      <select
        aria-label={label}
        value={Array.from(selectedKeys ?? [])[0] ?? ''}
        onChange={(e) => onSelectionChange(new Set(e.target.value ? [e.target.value] : []))}
      >
        <option value="" />
        {([] as ReactElement[]).concat(children ?? []).map((item) => (
          <option key={String(item.key)} value={String(item.key)}>{String(item.key)}</option>
        ))}
      </select>
    ),
    SelectItem: () => null,
    RadioGroup: ({ label, value, onValueChange, children }: {
      label?: string; value?: string; onValueChange: (value: string) => void;
      children?: ReactElement<{ value: string; children?: ReactNode }>[];
    }) => (
      <fieldset aria-label={label}>
        {(children ?? []).map((radio) => (
          <label key={radio.props.value}>
            <input type="radio" checked={value === radio.props.value} onChange={() => onValueChange(radio.props.value)} />
            {radio.props.children}
          </label>
        ))}
      </fieldset>
    ),
    Radio: () => null,
    Autocomplete: ({ label, selectedKey }: { label?: string; selectedKey?: string | null }) => (
      <input aria-label={label} value={selectedKey ?? ''} readOnly />
    ),
    AutocompleteItem: () => null,
    ModalContent: ({ children }: { children?: ReactNode | (() => ReactNode) }) => (
      <>{typeof children === 'function' ? children() : children}</>
    ),
    ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  };
});

import { TastingForm } from '../TastingForm';

const expertTasting: TastingNote = {
  id: 'note-1',
  userId: 'user-1',
  itemId: 'wine-1',
  tastedAt: '2026-10-20T00:00:00.000Z',
  context: 'amis',
  rating: 4,
  readiness: 'PERFECT',
  notes: 'Long and silky',
  foodPairing: 'Lamb',
  photoUrl: null,
  robe: 'Deep ruby',
  nez: 'Blackcurrant, cedar',
  bouche: 'Firm, fresh',
  tanin: 4,
  acidite: 3,
  longueurBouche: 12,
  createdAt: '2026-10-20T20:00:00.000Z',
  updatedAt: '2026-10-20T20:00:00.000Z',
};

// What the tastings page passes, rebuilt on each of its renders.
const editNoteOf = (note: TastingNote) => ({ id: note.id, values: tastingToFormValues(note) });

const item = (fields: Partial<InventoryItem>) =>
  ({ name: 'Item', producer: 'Producer', isOwned: true, isOpened: false, ...fields }) as unknown as InventoryItem;

const field = (label: string) => screen.getByLabelText(label);

beforeEach(() => {
  vi.clearAllMocks();
  products = undefined;
  inventory = [item({ id: 'wine-1', category: 'wine' })];
  lookedUp = inventory;
  updateMutateAsync.mockResolvedValue(expertTasting);
  inventoryUpdate.mockResolvedValue(undefined);
});

describe('editing a tasting (#642)', () => {
  it('shows the saved perceived maturity and expert grid', async () => {
    render(<TastingForm open onClose={vi.fn()} editNote={editNoteOf(expertTasting)} />);

    await waitFor(() => expect(field('tastings.fields.robe')).toHaveValue('Deep ruby'));
    expect(field('tastings.fields.readiness')).toHaveValue('PERFECT');
    expect(field('tastings.fields.nez')).toHaveValue('Blackcurrant, cedar');
    expect(field('tastings.fields.bouche')).toHaveValue('Firm, fresh');
    expect(field('tastings.fields.tanin')).toHaveValue(4);
    expect(field('tastings.fields.acidite')).toHaveValue(3);
    expect(field('tastings.fields.longueurBouche')).toHaveValue(12);
    expect(field('tastings.fields.notes')).toHaveValue('Long and silky');
  });

  it('saves an untouched tasting with its perceived maturity and expert grid', async () => {
    render(<TastingForm open onClose={vi.fn()} editNote={editNoteOf(expertTasting)} />);
    await waitFor(() => expect(field('tastings.fields.robe')).toHaveValue('Deep ruby'));

    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 'note-1',
      data: expect.objectContaining({
        rating: 4,
        readiness: 'PERFECT',
        robe: 'Deep ruby',
        nez: 'Blackcurrant, cedar',
        bouche: 'Firm, fresh',
        tanin: 4,
        acidite: 3,
        longueurBouche: 12,
      }),
    });
  });

  it('keeps what is being typed when the page renders again (background refetch)', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<TastingForm open onClose={onClose} editNote={editNoteOf(expertTasting)} />);
    await waitFor(() => expect(field('tastings.fields.notes')).toHaveValue('Long and silky'));

    fireEvent.change(field('tastings.fields.notes'), { target: { value: 'Typed meanwhile' } });
    fireEvent.change(field('tastings.fields.robe'), { target: { value: 'Garnet' } });
    // Same tasting, new objects: what a refetch of the list hands the form.
    rerender(<TastingForm open onClose={onClose} editNote={editNoteOf(expertTasting)} />);
    await act(async () => {});

    expect(field('tastings.fields.notes')).toHaveValue('Typed meanwhile');
    expect(field('tastings.fields.robe')).toHaveValue('Garnet');
  });

  it('starts again from the saved tasting when reopened', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<TastingForm open onClose={onClose} editNote={editNoteOf(expertTasting)} />);
    await waitFor(() => expect(field('tastings.fields.notes')).toHaveValue('Long and silky'));
    fireEvent.change(field('tastings.fields.notes'), { target: { value: 'Abandoned draft' } });

    rerender(<TastingForm open={false} onClose={onClose} editNote={editNoteOf(expertTasting)} />);
    rerender(<TastingForm open onClose={onClose} editNote={editNoteOf(expertTasting)} />);

    await waitFor(() => expect(field('tastings.fields.notes')).toHaveValue('Long and silky'));
  });

  it('shows another tasting when the dialog turns to it', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<TastingForm open onClose={onClose} editNote={editNoteOf(expertTasting)} />);
    await waitFor(() => expect(field('tastings.fields.robe')).toHaveValue('Deep ruby'));

    const other = { ...expertTasting, id: 'note-2', robe: 'Pale gold', readiness: 'TOO_YOUNG' as const };
    rerender(<TastingForm open onClose={onClose} editNote={editNoteOf(other)} />);

    await waitFor(() => expect(field('tastings.fields.robe')).toHaveValue('Pale gold'));
    expect(field('tastings.fields.readiness')).toHaveValue('TOO_YOUNG');
  });
});

describe('stock question after a new tasting (#595, #586)', () => {
  async function saveNewTastingOf(itemId: string, onClose = vi.fn()) {
    createMutateAsync.mockResolvedValue({ ...expertTasting, id: 'new-note', itemId });
    render(<TastingForm open onClose={onClose} initialItemId={itemId} />);
    if (products?.length !== 0) await waitFor(() => expect(field('tastingWine.wine *')).toHaveValue(`p-${itemId}`));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
  }

  it('offers "opened" and "consumed" for a closed bottle', async () => {
    inventory = [item({ id: 'wine-1', category: 'wine', isOpened: false })];
    lookedUp = inventory;
    await saveNewTastingOf('wine-1');

    expect(await screen.findByRole('button', { name: 'tastings.stockUpdate.opened' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tastings.stockUpdate.opened' }));
    await waitFor(() => expect(inventoryUpdate).toHaveBeenCalledTimes(1));
    expect(inventoryUpdate).toHaveBeenCalledWith({
      id: 'wine-1',
      patch: expect.objectContaining({ isOpened: true, fillLevel: 50, tastingId: 'new-note' }),
    });
  });

  it('never offers to reopen an already opened bottle (#595)', async () => {
    inventory = [item({ id: 'wine-1', category: 'wine', isOpened: true, fillLevel: 20, openedAt: '2026-10-10' })];
    lookedUp = inventory;
    await saveNewTastingOf('wine-1');

    expect(await screen.findByRole('button', { name: 'tastings.stockUpdate.consumed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tastings.stockUpdate.opened' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'tastings.stockUpdate.ignore' }));
    await act(async () => {});
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  // #586, #471 (FEAT-95): one cigar smoked by the API, never `quantity − 1`
  // (a correction of the number of boxes) nor the whole box.
  it('smokes exactly one cigar of the box, never the whole box (#586)', async () => {
    inventory = [item({ id: 'cigar-1', category: 'cigar', quantity: 3, cigarsPerBox: 25, cigarsLeft: null })];
    lookedUp = inventory;
    const onClose = vi.fn();
    await saveNewTastingOf('cigar-1', onClose);

    const removeOne = await screen.findByRole('button', { name: 'tastings.stockUpdate.smokeOne.opensBox|24' });
    expect(screen.queryByRole('button', { name: 'tastings.stockUpdate.consumed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'tastings.stockUpdate.opened' })).toBeNull();
    fireEvent.click(removeOne);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(inventoryUpdate).toHaveBeenCalledWith({ id: 'cigar-1', patch: { smokeOne: true, tastingId: 'new-note' } });
  });

  // Review #807: a refusal the update already explained gets no generic toast on top.
  it.each([
    ['NOTHING_LEFT_TO_SMOKE', false],
    ['UNEXPECTED_ERROR', true],
  ])('a smoke refused with %s keeps the dialog open, generic toast: %s', async (code, generic) => {
    const { notifyError } = await import('@/lib/toast');
    vi.mocked(notifyError).mockClear();
    inventoryUpdate.mockRejectedValueOnce(new Error(code));
    inventory = [item({ id: 'cigar-1', category: 'cigar', quantity: 3, cigarsPerBox: 25, cigarsLeft: null })];
    lookedUp = inventory;
    await saveNewTastingOf('cigar-1');

    fireEvent.click(await screen.findByRole('button', { name: 'tastings.stockUpdate.smokeOne.opensBox|24' }));
    await waitFor(() => expect(inventoryUpdate).toHaveBeenCalled());
    await act(async () => {});
    expect(vi.mocked(notifyError).mock.calls.some(([key]) => key === 'tastings.stockUpdate.error')).toBe(generic);
    expect(screen.getByRole('button', { name: 'tastings.stockUpdate.smokeOne.opensBox|24' })).toBeInTheDocument();
  });

  // The list misses it (2,000-row cap, not loaded, failed), but the item's
  // own cache entry or the server knows it: the box is still a box.
  it('reads the stock of an item missing from the loaded list', async () => {
    inventory = [];
    products = [];
    lookedUp = [item({ id: 'cigar-1', category: 'cigar', quantity: 25 })];
    await saveNewTastingOf('cigar-1');

    expect(await screen.findByRole('button', { name: 'tastings.stockUpdate.smokeOne.single|24' })).toBeInTheDocument();
    expect(lookUpItem).toHaveBeenCalledWith('cigar-1');
    expect(screen.queryByRole('button', { name: 'tastings.stockUpdate.consumed' })).toBeNull();
  });

  it('asks nothing when the stock of the tasted item cannot be read', async () => {
    inventory = [];
    products = [];
    lookedUp = [];
    const onClose = vi.fn();
    await saveNewTastingOf('wine-1', onClose);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('tastings.stockUpdate.title')).toBeNull();
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  it('asks nothing for a non-owned reference', async () => {
    inventory = [item({ id: 'wine-1', category: 'wine', isOwned: false })];
    lookedUp = inventory;
    const onClose = vi.fn();
    await saveNewTastingOf('wine-1', onClose);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('tastings.stockUpdate.title')).toBeNull();
  });

  it('asks nothing for an empty cigar box', async () => {
    inventory = [item({ id: 'cigar-1', category: 'cigar', quantity: 0 })];
    lookedUp = inventory;
    const onClose = vi.fn();
    await saveNewTastingOf('cigar-1', onClose);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('tastings.stockUpdate.title')).toBeNull();
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });
});

// #471 (FEAT-107): tastings on the wine — of a bottle of the cellar, or tasted elsewhere.
describe('the wine tasted (FEAT-107)', () => {
  const line = (fields: Record<string, unknown>) => ({
    cellarId: 'c1', deletedAt: null, writtenOffAt: null, isOpened: false, fillLevel: null, cigarsLeft: null, cigarsPerBox: null,
    quantity: 1, purchasedAt: '2026-01-15', purchasePrice: 20, createdAt: '2026-01-15', productId: 'talbot', ...fields,
  });
  const talbot = (lines: Record<string, unknown>[]) =>
    ({ id: 'talbot', name: 'Talbot', producer: 'Château Talbot', category: 'wine', vintage: 2015, format: null, items: lines }) as unknown as Product;

  beforeEach(() => {
    createMutateAsync.mockImplementation(async (values: { itemId?: string; productId?: string }) => ({
      ...expertTasting, id: 'new-note', itemId: values.itemId ?? null, productId: values.productId ?? 'created',
    }));
  });

  const save = () => fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));

  // c2: a wine in stock, tasted elsewhere: the wine only, the stock untouched.
  it('notes a tasting "sans bouteille" on a wine in stock: no bottle, no stock question', async () => {
    products = [talbot([line({ id: 'g6', quantity: 6 })])];
    const onClose = vi.fn();
    render(<TastingForm open onClose={onClose} initialProductId="talbot" />);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'tastingWine.yes' })).toBeChecked());

    fireEvent.click(screen.getByRole('radio', { name: 'tastingWine.elsewhere' }));
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ productId: 'talbot' }));
    expect(createMutateAsync.mock.calls[0][0]).not.toHaveProperty('itemId');
    expect(screen.queryByText('tastings.stockUpdate.title')).toBeNull();
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  // c3: "Bue" on a bottle of a ×6: the tasting goes with the bottle taken off the group.
  it('presets the only line; "Bue" sends the tasting with the state', async () => {
    products = [talbot([line({ id: 'g6', quantity: 6 })])];
    lookedUp = [item({ id: 'g6', category: 'wine', quantity: 6, isOpened: false })];
    render(<TastingForm open onClose={vi.fn()} initialProductId="talbot" />);
    await waitFor(() => expect(field('tastingWine.whichBottle *')).toHaveValue('g6'));

    save();
    fireEvent.click(await screen.findByRole('button', { name: 'tastings.stockUpdate.consumed' }));

    await waitFor(() => expect(inventoryUpdate).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ productId: 'talbot', itemId: 'g6' }));
    expect(inventoryUpdate).toHaveBeenCalledWith({ id: 'g6', patch: { isOpened: true, fillLevel: 0, tastingId: 'new-note' } });
  });

  it('presets the opened bottle among several lines', async () => {
    products = [talbot([line({ id: 'g6', quantity: 6 }), line({ id: 'g2', quantity: 2, cellarId: null }), line({ id: 'open', isOpened: true, fillLevel: 60 })])];
    render(<TastingForm open onClose={vi.fn()} initialProductId="talbot" />);

    await waitFor(() => expect(field('tastingWine.whichBottle *')).toHaveValue('open'));
  });

  it('several full lines: the member picks the bottle, never one chosen for them', async () => {
    products = [talbot([line({ id: 'g6', quantity: 6 }), line({ id: 'g2', quantity: 2, cellarId: null })])];
    render(<TastingForm open onClose={vi.fn()} initialProductId="talbot" />);
    await waitFor(() => expect(field('tastingWine.whichBottle *')).toHaveValue(''));

    save();
    await act(async () => {});
    expect(createMutateAsync).not.toHaveBeenCalled();

    fireEvent.change(field('tastingWine.whichBottle *'), { target: { value: 'g2' } });
    save();
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ productId: 'talbot', itemId: 'g2' })));
  });

  // W2 report: a wine without any bottle left is tasted elsewhere, without a question.
  it('a wine without any bottle in the cellar: no bottle question, the wine only', async () => {
    products = [talbot([])];
    const onClose = vi.fn();
    render(<TastingForm open onClose={onClose} initialProductId="talbot" />);
    await waitFor(() => expect(field('tastingWine.wine *')).toHaveValue('talbot'));

    expect(screen.queryByRole('radio', { name: 'tastingWine.yes' })).toBeNull();
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ productId: 'talbot' });
    expect(createMutateAsync.mock.calls[0][0]).not.toHaveProperty('itemId');
  });

  // c4: a wine never had, named — Glou finds it or adds it without any bottle.
  it('"Nouvelle dégustation" of a wine not in the list sends its name, never a bottle', async () => {
    products = [talbot([line({ id: 'g6', quantity: 6 })])];
    const onClose = vi.fn();
    render(<TastingForm open onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'tastingWine.notListed' }));
    fireEvent.change(field('inventory.fields.producer *'), { target: { value: ' Domaine X ' } });
    fireEvent.change(field('inventory.fields.name *'), { target: { value: 'Cuvée A' } });
    fireEvent.change(field('inventory.fields.vintage'), { target: { value: '2020' } });
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const sent = createMutateAsync.mock.calls[0][0];
    expect(sent.wine).toEqual({ category: 'wine', producer: 'Domaine X', name: 'Cuvée A', vintage: 2020 });
    expect(sent).not.toHaveProperty('productId');
    expect(sent).not.toHaveProperty('itemId');
  });

  it('a wine named needs its producer and its name', async () => {
    products = [];
    render(<TastingForm open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'tastingWine.notListed' }));
    fireEvent.change(field('inventory.fields.name *'), { target: { value: 'Cuvée A' } });

    save();
    await act(async () => {});

    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('a new tasting needs a wine', async () => {
    products = [talbot([])];
    render(<TastingForm open onClose={vi.fn()} />);

    save();
    await act(async () => {});

    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
