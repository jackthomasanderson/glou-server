import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// #690: the inventory page, the scan, the first-run wizard and the cellar
// page each wired "save what the add form sent" on their own, and the
// copies drifted (default cellar, collections). They now share this hook.

const createItem = vi.fn();
const addToCollection = vi.fn();
const notifyError = vi.fn();
vi.mock('@/hooks/useInventory', () => ({
  useCreateInventoryItem: () => ({ mutateAsync: createItem, isPending: false }),
}));
vi.mock('@/hooks/useCollections', () => ({
  useAddItemsToCollection: () => ({ mutateAsync: addToCollection, isPending: false }),
}));
vi.mock('@/lib/toast', () => ({ notifyError: (...a: unknown[]) => notifyError(...a) }));

import { useCreateFromForm, withDefaultCellar } from './useCreateFromForm';

const CHABLIS = { category: 'wine', producer: 'Domaine X', name: 'Chablis' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  createItem.mockResolvedValue({ id: 'new-1', ...CHABLIS });
  addToCollection.mockResolvedValue({});
});

describe('withDefaultCellar — one rule for every add path', () => {
  it('gives an untouched cellar field the caller\'s cellar', () => {
    expect(withDefaultCellar({ ...CHABLIS }, 'wizard-cellar')).toEqual({ ...CHABLIS, cellarId: 'wizard-cellar' });
  });

  it('keeps an explicit "No cellar"', () => {
    expect(withDefaultCellar({ ...CHABLIS, cellarId: null }, 'wizard-cellar')).toEqual({ ...CHABLIS, cellarId: null });
  });

  it('keeps the cellar picked in the form', () => {
    expect(withDefaultCellar({ ...CHABLIS, cellarId: 'garage' }, 'wizard-cellar')).toEqual({ ...CHABLIS, cellarId: 'garage' });
  });

  it('adds nothing when the caller has no cellar', () => {
    expect(withDefaultCellar({ ...CHABLIS }, null)).toEqual({ ...CHABLIS });
  });
});

describe('useCreateFromForm', () => {
  it('creates the entry in the default cellar and files it in the collections picked', async () => {
    const { result } = renderHook(() => useCreateFromForm({ defaultCellarId: 'wizard-cellar' }));
    let created: unknown;
    await act(async () => { created = await result.current.create({ ...CHABLIS }, ['col-1', 'col-2']); });

    expect(created).toMatchObject({ id: 'new-1' });
    expect(createItem).toHaveBeenCalledWith({ ...CHABLIS, cellarId: 'wizard-cellar' });
    expect(addToCollection).toHaveBeenCalledWith({ id: 'col-1', itemIds: ['new-1'] });
    expect(addToCollection).toHaveBeenCalledWith({ id: 'col-2', itemIds: ['new-1'] });
  });

  it('passes the scan job along, for the provenance of the fields read', async () => {
    const { result } = renderHook(() => useCreateFromForm());
    await act(async () => { await result.current.create({ ...CHABLIS, scanJobId: 'job-1' }); });
    expect(createItem).toHaveBeenCalledWith({ ...CHABLIS, scanJobId: 'job-1' });
    expect(addToCollection).not.toHaveBeenCalled();
  });

  it('answers null when the save fails, and files nothing', async () => {
    createItem.mockRejectedValue(new Error('UNEXPECTED_ERROR'));
    const { result } = renderHook(() => useCreateFromForm());
    let created: unknown = 'unset';
    await act(async () => { created = await result.current.create({ ...CHABLIS }, ['col-1']); });
    expect(created).toBeNull();
    expect(addToCollection).not.toHaveBeenCalled();
  });

  it('still answers the item saved when a collection fails, and says so once', async () => {
    addToCollection.mockRejectedValue(new Error('UNEXPECTED_ERROR'));
    const { result } = renderHook(() => useCreateFromForm());
    let created: unknown;
    await act(async () => { created = await result.current.create({ ...CHABLIS }, ['col-1', 'col-2']); });
    expect(created).toMatchObject({ id: 'new-1' });
    await waitFor(() => expect(notifyError).toHaveBeenCalledOnce());
    expect(notifyError).toHaveBeenCalledWith('toast.collection.updateError');
  });
});
