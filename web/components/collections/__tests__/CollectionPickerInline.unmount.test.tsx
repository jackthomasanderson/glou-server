import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #887 (3): a change of collection that fails after the drawer was closed is
// still said. React Query drops a `mutate(…, { onError })` callback once the
// component is gone; the failure must not depend on the picker being shown.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const notifyError = vi.fn();
vi.mock('@/lib/toast', () => ({ notifyError: (...args: unknown[]) => notifyError(...args), notifySuccess: vi.fn() }));
vi.mock('@heroui/react', () => ({
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Spinner: () => null,
}));
const garde = { id: 'c1', name: 'Garde', color: '#800020' };
const fetes = { id: 'c2', name: 'Fêtes', color: '#c9a227' };
let fail: ((err: Error) => void) | null = null;
vi.mock('@/lib/collections/client', () => ({
  collectionsClient: {
    list: async () => [garde, fetes],
    addProducts: () => new Promise((_resolve, reject) => { fail = reject; }),
    removeProduct: vi.fn(),
  },
}));

import { createQueryClient } from '@/lib/queryClient';
import { CollectionPickerInline } from '../CollectionPickerInline';

describe('CollectionPickerInline, failure after it closed (#887)', () => {
  it('still says the change failed', async () => {
    const { unmount } = render(
      <QueryClientProvider client={createQueryClient()}>
        <CollectionPickerInline productId="p1" currentCollections={[garde]} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'collections.addToItem' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fêtes' }));
    await waitFor(() => expect(fail).not.toBeNull());
    unmount();
    await act(async () => { fail!(new Error('COLLECTION_NOT_FOUND')); });
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(notifyError).toHaveBeenCalledWith('toast.collection.updateError');
  });
});
