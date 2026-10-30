import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import type { InventoryItem } from '@/lib/inventory/types';
import type { TastingNote } from '@/lib/tastings/types';
import { tastingToFormValues } from '@/lib/tastings/formValues';

// #642: editing a tasting showed its perceived maturity and expert grid empty,
// saving lost the maturity, and any re-render of the page (a background
// refetch) reset what was being typed.
// #595 / #586: the stock question after a tasting put an opened bottle back
// to 50 %, and emptied a whole cigar box for one smoked cigar.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.count !== undefined ? `${k}|${o.count}` : k) }),
}));

let inventory: InventoryItem[] = [];
const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const inventoryUpdate = vi.fn();

vi.mock('@/hooks/useTastings', () => ({
  useCreateTasting: () => ({ mutateAsync: createMutateAsync, isPending: false, error: null }),
  useUpdateTasting: () => ({ mutateAsync: updateMutateAsync, isPending: false, error: null }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: inventory }),
  useUpdateInventoryItem: () => ({ mutateAsync: inventoryUpdate, isPending: false }),
}));
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
  inventory = [item({ id: 'wine-1', category: 'wine' })];
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
    await waitFor(() => expect(field('tastings.fields.item *')).toHaveValue(itemId));
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
  }

  it('offers "opened" and "consumed" for a closed bottle', async () => {
    inventory = [item({ id: 'wine-1', category: 'wine', isOpened: false })];
    await saveNewTastingOf('wine-1');

    expect(await screen.findByRole('button', { name: 'tastings.stockUpdate.opened' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tastings.stockUpdate.opened' }));
    await waitFor(() => expect(inventoryUpdate).toHaveBeenCalledTimes(1));
    expect(inventoryUpdate).toHaveBeenCalledWith({
      id: 'wine-1',
      patch: expect.objectContaining({ isOpened: true, fillLevel: 50 }),
    });
  });

  it('never offers to reopen an already opened bottle (#595)', async () => {
    inventory = [item({ id: 'wine-1', category: 'wine', isOpened: true, fillLevel: 20, openedAt: '2026-10-10' })];
    await saveNewTastingOf('wine-1');

    expect(await screen.findByRole('button', { name: 'tastings.stockUpdate.consumed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tastings.stockUpdate.opened' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'tastings.stockUpdate.ignore' }));
    await act(async () => {});
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  it('removes exactly one cigar from the box, never the whole box (#586)', async () => {
    inventory = [item({ id: 'cigar-1', category: 'cigar', quantity: 25 })];
    const onClose = vi.fn();
    await saveNewTastingOf('cigar-1', onClose);

    const removeOne = await screen.findByRole('button', { name: 'tastings.stockUpdate.removeOneCigar|24' });
    expect(screen.queryByRole('button', { name: 'tastings.stockUpdate.consumed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'tastings.stockUpdate.opened' })).toBeNull();
    fireEvent.click(removeOne);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(inventoryUpdate).toHaveBeenCalledWith({ id: 'cigar-1', patch: { quantity: 24 } });
  });

  it('asks nothing for an empty cigar box', async () => {
    inventory = [item({ id: 'cigar-1', category: 'cigar', quantity: 0 })];
    const onClose = vi.fn();
    await saveNewTastingOf('cigar-1', onClose);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('tastings.stockUpdate.title')).toBeNull();
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });
});
