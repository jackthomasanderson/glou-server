import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { InventoryItem } from '@/lib/inventory/types';

// AUDIT_006: in the wizard, saving a second bottle of the same wine did
// nothing. The server refuses a duplicate (409 DUPLICATE_CANDIDATE) until the
// screen says "create anyway", the create hook stays silent on that refusal,
// and this step never handled it: no dialog, no message, the form just sat
// there. It now goes through the same duplicate flow as the inventory page.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.count !== undefined ? `${k}|${o.count}` : k) }),
}));

const CHABLIS = { category: 'wine', producer: 'Domaine X', name: 'Chablis', vintage: 2020 } as const;
const existingChablis = { id: 'existing-1', ...CHABLIS, quantity: 1 } as unknown as InventoryItem;

let inventory: InventoryItem[] = [];
const createMutateAsync = vi.fn();
const updateMutate = vi.fn();
const addToCollection = vi.fn();
const freshList = vi.fn();

vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: inventory }),
  useCreateInventoryItem: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateInventoryItem: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useCollections', () => ({ useAddItemsToCollection: () => ({ mutateAsync: addToCollection }) }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('@/lib/inventory/client', () => ({ inventoryClient: { list: () => freshList() } }));

// The real form is heavy; this stand-in submits whatever the test sets.
let formValues: Partial<InventoryItem> = {};
let formCollections: string[] = [];
vi.mock('@/components/inventory/InventoryForm', () => ({
  InventoryForm: ({ open, onSubmit }: { open: boolean; onSubmit: (v: Partial<InventoryItem>, c: string[]) => void }) =>
    open ? (
      <div role="dialog" aria-label="add form">
        <button type="button" onClick={() => onSubmit(formValues, formCollections)}>save bottle</button>
      </div>
    ) : null,
}));
vi.mock('@/components/inventory/DuplicateDialog', () => ({
  DuplicateDialog: ({ onIncrement, onCreateAnyway, onCancel }: { onIncrement: () => void; onCreateAnyway: () => void; onCancel: () => void }) => (
    <div role="dialog" aria-label="duplicate choice">
      <button type="button" onClick={onIncrement}>increment</button>
      <button type="button" onClick={onCreateAnyway}>create anyway</button>
      <button type="button" onClick={onCancel}>cancel</button>
    </div>
  ),
}));

import { ManualIngestionStep } from '../steps/ManualIngestionStep';

const onItemAdded = vi.fn();

function renderStep() {
  render(
    <ManualIngestionStep cellarId="wizard-cellar" itemsAdded={0} onItemAdded={onItemAdded} onDone={() => {}} onBack={() => {}} />,
  );
}

async function saveBottle(values: Partial<InventoryItem>, collections: string[] = []) {
  formValues = values;
  formCollections = collections;
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.manual.addButton' }));
  fireEvent.click(screen.getByRole('button', { name: 'save bottle' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  inventory = [];
});

describe('ManualIngestionStep duplicates (AUDIT_006)', () => {
  it('saves a new bottle in the wizard cellar, counts it and closes the form', async () => {
    createMutateAsync.mockResolvedValue({ id: 'new-1', ...CHABLIS });
    renderStep();
    await saveBottle({ ...CHABLIS });

    await waitFor(() => expect(onItemAdded).toHaveBeenCalledOnce());
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: 'Chablis', cellarId: 'wizard-cellar' }));
    expect(screen.queryByRole('dialog', { name: 'add form' })).toBeNull();
  });

  it('offers the duplicate choice for a second bottle of the same wine, instead of doing nothing', async () => {
    inventory = [existingChablis];
    renderStep();
    await saveBottle({ ...CHABLIS });

    expect(await screen.findByRole('dialog', { name: 'duplicate choice' })).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(onItemAdded).not.toHaveBeenCalled();
  });

  it('offers the choice too when only the server knows the duplicate', async () => {
    createMutateAsync.mockRejectedValue(new Error('DUPLICATE_CANDIDATE'));
    freshList.mockResolvedValue([existingChablis]);
    renderStep();
    await saveBottle({ ...CHABLIS });

    expect(await screen.findByRole('dialog', { name: 'duplicate choice' })).toBeInTheDocument();
    expect(onItemAdded).not.toHaveBeenCalled();
  });

  it('"Create anyway" saves the second bottle and counts it', async () => {
    inventory = [existingChablis];
    createMutateAsync.mockResolvedValue({ id: 'new-2', ...CHABLIS });
    renderStep();
    await saveBottle({ ...CHABLIS });
    fireEvent.click(await screen.findByRole('button', { name: 'create anyway' }));

    await waitFor(() => expect(onItemAdded).toHaveBeenCalledOnce());
    expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: 'Chablis', confirmDuplicate: true }));
    expect(screen.queryByRole('dialog', { name: 'duplicate choice' })).toBeNull();
  });

  it('counts an increment only once it has succeeded', async () => {
    inventory = [existingChablis];
    renderStep();
    await saveBottle({ ...CHABLIS });
    fireEvent.click(await screen.findByRole('button', { name: 'increment' }));

    const [, handlers] = updateMutate.mock.calls[0] as [unknown, { onSuccess?: () => void; onSettled?: () => void }];
    act(() => handlers.onSettled?.());
    expect(onItemAdded).not.toHaveBeenCalled();
    act(() => handlers.onSuccess?.());
    expect(onItemAdded).toHaveBeenCalledOnce();
  });

  it('keeps the collections picked in the form', async () => {
    createMutateAsync.mockResolvedValue({ id: 'new-3', ...CHABLIS });
    renderStep();
    await saveBottle({ ...CHABLIS }, ['col-1']);

    await waitFor(() => expect(addToCollection).toHaveBeenCalledWith({ id: 'col-1', itemIds: ['new-3'] }));
  });
});
