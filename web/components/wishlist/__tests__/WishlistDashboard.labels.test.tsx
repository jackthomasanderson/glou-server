import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #1041: in the wish dialog, name and producer do not share a placeholder, and
// the vintage and ceiling price fields keep their label above the field (a
// HeroUI outside label moves into an empty field when it has no placeholder).

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('@/hooks/useWishlist', () => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useWishlist: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
    useCreateWishlistItem: idle, useUpdateWishlistItem: idle, useDeleteWishlistItem: idle, useRecordPriceSeen: idle, useConvertToInventory: idle,
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

describe('WishlistDashboard — the wish form fields (#1041)', () => {
  it('gives every text field a placeholder of its own', () => {
    render(<WishlistDashboard />);
    fireEvent.click(screen.getByTestId('wishlist-create-button'));
    const dialog = screen.getByRole('dialog');
    const placeholders = within(dialog).getAllByRole('textbox')
      .map((input) => (input as HTMLInputElement).placeholder)
      .filter(Boolean);
    expect(new Set(placeholders).size).toBe(placeholders.length);
    expect(within(dialog).getByLabelText(t('wishlist.form.vintage'))).toHaveProperty('placeholder', t('wishlist.form.vintagePlaceholder'));
    expect(within(dialog).getByLabelText(t('wishlist.form.maxPrice'))).toHaveProperty('placeholder', t('wishlist.form.maxPricePlaceholder'));
    expect(within(dialog).getByLabelText(t('wishlist.form.name'), { exact: false })).toHaveProperty('placeholder', t('wishlist.form.namePlaceholder'));
    expect(t('wishlist.form.namePlaceholder')).not.toBe(t('wishlist.form.producerPlaceholder'));
  });
});
