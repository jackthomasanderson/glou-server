import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { InventoryEntry } from '@/components/inventory/InventoryForm';

// AUDIT_006: in the wizard, saving a second bottle of the same wine did
// nothing. #471 (FEAT-97 c4, #690): the form now says "Vous avez déjà ce vin"
// while typing (tested with the form); this step saves what the form sends —
// a new wine, possibly told apart ("C'est un autre vin") — and counts bottles
// added to a known wine as an entry too.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.count !== undefined ? `${k}|${o.count}` : k) }),
}));

const CHABLIS = { category: 'wine', producer: 'Domaine X', name: 'Chablis', vintage: 2020 } as const;

const createMutateAsync = vi.fn();
const addToCollection = vi.fn();

vi.mock('@/hooks/useInventory', () => ({
  useCreateInventoryItem: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));
vi.mock('@/hooks/useCollections', () => ({ useAddItemsToCollection: () => ({ mutateAsync: addToCollection, isPending: false }) }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));

// The real form is heavy; this stand-in submits whatever the test sets, or
// says the bottles joined a known wine.
let formValues: InventoryEntry = {};
let formCollections: string[] = [];
vi.mock('@/components/inventory/InventoryForm', () => ({
  InventoryForm: ({ open, onSubmit, onJoined, onClose }: {
    open: boolean; onSubmit: (v: InventoryEntry, c: string[]) => void; onJoined?: () => void; onClose: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="add form">
        <button type="button" onClick={() => onSubmit(formValues, formCollections)}>save bottle</button>
        <button type="button" onClick={() => { onJoined?.(); onClose(); }}>add to the known wine</button>
      </div>
    ) : null,
}));

import { ManualIngestionStep } from '../steps/ManualIngestionStep';

const onItemAdded = vi.fn();

function renderStep() {
  render(
    <ManualIngestionStep cellarId="wizard-cellar" itemsAdded={0} onItemAdded={onItemAdded} onDone={() => {}} onBack={() => {}} />,
  );
}

function saveBottle(values: InventoryEntry, collections: string[] = []) {
  formValues = values;
  formCollections = collections;
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.manual.addButton' }));
  fireEvent.click(screen.getByRole('button', { name: 'save bottle' }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ManualIngestionStep (AUDIT_006, FEAT-97)', () => {
  it('saves a new bottle in the wizard cellar, counts it and closes the form', async () => {
    createMutateAsync.mockResolvedValue({ id: 'new-1', ...CHABLIS });
    renderStep();
    saveBottle({ ...CHABLIS });

    await waitFor(() => expect(onItemAdded).toHaveBeenCalledOnce());
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: 'Chablis', cellarId: 'wizard-cellar' }));
    expect(screen.queryByRole('dialog', { name: 'add form' })).toBeNull();
  });

  it('sends "C\'est un autre vin" with the entry', async () => {
    createMutateAsync.mockResolvedValue({ id: 'new-2', ...CHABLIS });
    renderStep();
    saveBottle({ ...CHABLIS, distinctFrom: ['p1'] });

    await waitFor(() => expect(onItemAdded).toHaveBeenCalledOnce());
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ distinctFrom: ['p1'] }));
  });

  it('counts bottles added to a wine already known, and closes the form', () => {
    renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.manual.addButton' }));
    fireEvent.click(screen.getByRole('button', { name: 'add to the known wine' }));

    expect(onItemAdded).toHaveBeenCalledOnce();
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'add form' })).toBeNull();
  });

  it('keeps the form open and counts nothing when the save fails', async () => {
    createMutateAsync.mockRejectedValue(new Error('UNEXPECTED_ERROR'));
    renderStep();
    saveBottle({ ...CHABLIS });

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(onItemAdded).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'add form' })).toBeInTheDocument();
  });

  it('keeps the collections picked in the form', async () => {
    createMutateAsync.mockResolvedValue({ id: 'new-3', ...CHABLIS });
    renderStep();
    saveBottle({ ...CHABLIS }, ['col-1']);

    await waitFor(() => expect(addToCollection).toHaveBeenCalledWith({ id: 'col-1', itemIds: ['new-3'] }));
  });

  // #690: the wizard's `??` replaced an explicit "No cellar" by its own cellar.
  it('keeps an explicit "No cellar" picked in the form', async () => {
    createMutateAsync.mockResolvedValue({ id: 'new-4', ...CHABLIS });
    renderStep();
    saveBottle({ ...CHABLIS, cellarId: null });

    await waitFor(() => expect(onItemAdded).toHaveBeenCalledOnce());
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ cellarId: null }));
  });
});
