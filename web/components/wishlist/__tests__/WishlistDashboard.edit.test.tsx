import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #624: a wish's vintage now follows the bottle's rule (up to this year). A
// wish saved before with a later vintage must still be editable: the edit
// sends only the fields changed, like a bottle's (#572).

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

let wishes: unknown[] = [];
const update = vi.fn();
vi.mock('@/hooks/useWishlist', () => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useWishlist: () => ({ data: wishes, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
    useCreateWishlistItem: idle, useDeleteWishlistItem: idle, useRecordPriceSeen: idle, useConvertToInventory: idle,
    useUpdateWishlistItem: () => ({ mutateAsync: update, isPending: false }),
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

const nextYear = new Date().getFullYear() + 1;
const wish = {
  id: 'w1', userId: 'u1', name: 'Cuvée X', producer: 'Domaine Y', category: 'wine', vintage: nextYear,
  targetQuantity: 2, maxPrice: null, lastSeenPrice: null, priority: 'medium', status: 'active', notes: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
  wishes = [wish];
});

describe('WishlistDashboard — editing a wish (#624)', () => {
  it('sends only the notes typed, not the stored vintage the API no longer accepts', async () => {
    render(<WishlistDashboard />);
    fireEvent.click(screen.getByRole('button', { name: t('actions.edit') }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(t('wishlist.form.notes')), { target: { value: 'En primeur' } });
    fireEvent.click(within(dialog).getByTestId('wishlist-form-submit'));
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({ id: 'w1', data: { notes: 'En primeur' } });
  });

  it('does not send a vintage typed beyond this year', async () => {
    render(<WishlistDashboard />);
    fireEvent.click(screen.getByRole('button', { name: t('actions.edit') }));
    const dialog = screen.getByRole('dialog');
    const vintage = within(dialog).getByLabelText(t('wishlist.form.vintage'));
    fireEvent.change(vintage, { target: { value: String(nextYear + 1) } });
    fireEvent.blur(vintage);
    fireEvent.click(within(dialog).getByTestId('wishlist-form-submit'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(update).not.toHaveBeenCalled();
  });
});
