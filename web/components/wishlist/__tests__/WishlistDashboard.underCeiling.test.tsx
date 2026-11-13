import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #468: no price feed exists, so the member types the observed price
// themselves. Nothing is sent to them: a price at or below their ceiling is
// marked in the list instead.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

let wishes: unknown[] = [];
vi.mock('@/hooks/useWishlist', () => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useWishlist: () => ({ data: wishes, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
    useCreateWishlistItem: idle, useDeleteWishlistItem: idle, useRecordPriceSeen: idle, useConvertToInventory: idle,
    useUpdateWishlistItem: idle,
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

const wish = (fields: Record<string, unknown>) => ({
  id: 'w1', userId: 'u1', name: 'Cuvée X', producer: 'Domaine Y', category: 'sparkling', vintage: null,
  targetQuantity: 1, maxPrice: null, lastSeenPrice: null, lastSeenAt: null, priority: 'medium', status: 'active', notes: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...fields,
});

beforeEach(() => { wishes = []; });

describe('WishlistDashboard — observed price under the ceiling (#468)', () => {
  it('marks a wish whose observed price is at or below the ceiling (prices as the API sends them)', () => {
    wishes = [wish({ maxPrice: '45.00', lastSeenPrice: '42.00', lastSeenAt: '2026-11-10T00:00:00.000Z' })];
    render(<WishlistDashboard />);
    expect(screen.getByText(t('wishlist.priceSeen.underCeiling'))).toBeInTheDocument();
  });

  it('does not mark a price above the ceiling, nor a wish without a ceiling', () => {
    wishes = [
      wish({ maxPrice: 40, lastSeenPrice: 42, lastSeenAt: '2026-11-10T00:00:00.000Z' }),
      wish({ id: 'w2', lastSeenPrice: 42, lastSeenAt: '2026-11-10T00:00:00.000Z' }),
    ];
    render(<WishlistDashboard />);
    expect(screen.queryByText(t('wishlist.priceSeen.underCeiling'))).not.toBeInTheDocument();
  });

  it('no longer promises a notification for the ceiling', () => {
    expect(t('wishlist.form.maxPriceHint')).not.toMatch(/notifi/i);
  });
});
