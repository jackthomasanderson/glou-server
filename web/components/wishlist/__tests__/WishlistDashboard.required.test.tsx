import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #657: "Add a wish" keeps Save clickable; with the name empty, a click shows
// the field in red with the required-field message, and sends nothing.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const create = vi.fn();
vi.mock('@/hooks/useWishlist', () => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useWishlist: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
    useCreateWishlistItem: () => ({ mutateAsync: create, isPending: false }),
    useUpdateWishlistItem: idle, useDeleteWishlistItem: idle, useRecordPriceSeen: idle, useConvertToInventory: idle,
  };
});
vi.mock('@/hooks/useKnownWine', () => ({ useKnownWine: () => [] }));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useProducts', () => ({ useAddUnits: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o), i18n: { language: 'fr' } }),
}));

import { WishlistDashboard } from '../WishlistDashboard';

describe('WishlistDashboard — "Add a wish" without a name (#657)', () => {
  it('keeps Save clickable and shows the required-field error on the name', async () => {
    render(<WishlistDashboard />);
    fireEvent.click(screen.getByTestId('wishlist-create-button'));
    const submit = screen.getByTestId('wishlist-form-submit');
    expect(submit).not.toBeDisabled();
    expect(screen.queryByText(t('inventory.validation.required'))).toBeNull();

    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText(t('inventory.validation.required'))).toBeTruthy());
    expect(screen.getByTestId('wishlist-name-input')).toHaveAttribute('aria-invalid', 'true');
    expect(create).not.toHaveBeenCalled();
  });
});
