import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #580: adding a bottle to a collection, or removing it, from the detail
// window said nothing when the server refused.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('@heroui/react', () => ({
  Chip: ({ children, onClose }: { children?: ReactNode; onClose?: () => void }) => (
    <span>
      {children}
      {onClose && <button type="button" onClick={onClose}>remove chip</button>}
    </span>
  ),
  Spinner: () => null,
}));

type Handlers = { onError?: (e: Error) => void };
const failingMutate = vi.fn((_vars: unknown, handlers?: Handlers) => handlers?.onError?.(new Error('COLLECTION_NOT_FOUND')));
const garde = { id: 'c1', name: 'Garde', color: '#800020' };
const fetes = { id: 'c2', name: 'Fêtes', color: '#c9a227' };

vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({ data: [garde, fetes] }),
  useAddItemsToCollection: () => ({ mutate: failingMutate, isPending: false }),
  useRemoveItemFromCollection: () => ({ mutate: failingMutate, isPending: false }),
}));

import { notifyError } from '@/lib/toast';
import { CollectionPickerInline } from '../CollectionPickerInline';

beforeEach(() => vi.clearAllMocks());

describe('CollectionPickerInline failures', () => {
  it('says so when removing the bottle from a collection fails', () => {
    render(<CollectionPickerInline itemId="i1" currentCollections={[garde]} />);

    fireEvent.click(screen.getByRole('button', { name: 'remove chip' }));

    expect(failingMutate).toHaveBeenCalledWith({ id: 'c1', itemId: 'i1' }, expect.anything());
    expect(notifyError).toHaveBeenCalledWith('toast.collection.updateError');
  });

  it('says so when adding the bottle to a collection fails', () => {
    render(<CollectionPickerInline itemId="i1" currentCollections={[garde]} />);

    fireEvent.click(screen.getByRole('button', { name: 'collections.addToItem' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fêtes' }));

    expect(failingMutate).toHaveBeenCalledWith({ id: 'c2', itemIds: ['i1'] }, expect.anything());
    expect(notifyError).toHaveBeenCalledWith('toast.collection.updateError');
  });
});
