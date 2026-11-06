import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { product } from '@/lib/products/__tests__/factories';
import type { InventoryItem } from '@/lib/inventory/types';

// Recette n°5 ter of #847: « Vin mis à jour » after « Mettre à jour » a cigar.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const update = vi.fn();
vi.mock('@/hooks/useProducts', () => ({ useUpdateProduct: () => ({ mutateAsync: update, isPending: false }) }));
vi.mock('@/hooks/useCollections', () => ({
  useAddProductsToCollection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveProductFromCollection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const notifySuccess = vi.fn();
vi.mock('@/lib/toast', () => ({ notifySuccess: (...a: unknown[]) => notifySuccess(...a) }));
// The form itself is not what is tested: one button saves a new name.
vi.mock('../InventoryForm', () => ({
  InventoryForm: ({ onSubmit }: { onSubmit: (entry: Partial<InventoryItem>, collectionIds: string[]) => void }) => (
    <button type="button" onClick={() => onSubmit({ name: 'Nouveau nom' }, [])}>save</button>
  ),
}));

import { EditWineDialog } from '../EditWineDialog';

beforeEach(() => {
  update.mockReset().mockResolvedValue(product({ updatedAt: 'v2' }));
  notifySuccess.mockReset();
});

describe('EditWineDialog — the message once saved', () => {
  it.each([
    ['cigar', { context: 'cigar' }],
    ['spirit', { context: 'spirit' }],
    ['wine', undefined],
    ['sparkling', undefined],
  ] as const)('a %s is told in its own words', async (category, context) => {
    render(<EditWineDialog product={product({ category })} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('familyDrawer.form.saved', context));
    // Its category goes with the write, for the words of a refusal (« ce cigare a été modifié entre-temps »).
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ category }));
  });
});
