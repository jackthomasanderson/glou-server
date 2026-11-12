import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateInventoryItem } from './useInventory';
import { useProductDetail } from './useProducts';
import { useConsumptionSuggestions, useGoalProgress } from './useConsumptionPlan';
import { useAlerts } from './useAlerts';
import { useSidebarCounts } from './useSidebarCounts';
import { product, unit } from '@/lib/products/__tests__/factories';

// #621: every screen derived from the stock follows a change of a bottle at
// once — no hidden piggyback on a list invalidation, no tab switch needed.

const update = vi.fn();
vi.mock('@/lib/inventory/client', () => ({ inventoryClient: { update: (...a: unknown[]) => update(...a) } }));
vi.mock('@/lib/offline/syncEngine', () => ({
  overlayQueuedChanges: async <T,>(items: T) => items,
  enqueueMutation: vi.fn(),
  shownAfter: <T,>(item: T) => item,
  markQueuedResult: <T,>(result: T) => result,
  queuedMutationOf: () => undefined,
}));
vi.mock('@/lib/offline/db', () => ({
  mirrorInventoryToCache: vi.fn(),
  getCachedInventory: vi.fn(async () => []),
  getAllQueuedMutations: vi.fn(async () => []),
}));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const detailGet = vi.fn();
vi.mock('@/lib/products/client', () => ({ productsClient: { get: (...a: unknown[]) => detailGet(...a) } }));
const goal = vi.fn();
const suggestions = vi.fn();
vi.mock('@/lib/consumption-plan/client', () => ({
  consumptionPlanClient: { getGoalProgress: () => goal(), suggestions: (limit: number) => suggestions(limit) },
}));
const alerts = vi.fn();
vi.mock('@/lib/alerts/client', () => ({ alertsClient: { list: () => alerts() } }));
const counts = vi.fn();
vi.mock('@/lib/api', () => ({ client: { get: (url: string) => counts(url) } }));

function wrapperOf(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const group = unit({ id: 'g', productId: 'p1', quantity: 3 });
const flatRow = (over: Partial<typeof group>) => ({ ...group, name: 'Cuvée X', category: 'wine', producer: 'Domaine', ...over });

afterEach(() => vi.clearAllMocks());

describe('a change of a bottle refreshes what is derived from the stock (#621)', () => {
  it('lowering the quantity in the drawer reads the wine again, so its History shows the change', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const history = [{ id: 'h1', field: 'quantity' }];
    detailGet
      .mockResolvedValueOnce({ ...product({ id: 'p1' }), items: [group], tastings: [], history: [] })
      .mockResolvedValue({ ...product({ id: 'p1' }), items: [{ ...group, quantity: 2 }], tastings: [], history });
    const { result } = renderHook(() => ({ drawer: useProductDetail('p1'), update: useUpdateInventoryItem() }), { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(result.current.drawer.data).toBeDefined());

    update.mockResolvedValue({ data: flatRow({ quantity: 2 }), changed: [], removedIds: [] });
    await result.current.update.mutateAsync({ id: 'g', patch: { quantity: 2 } });

    await waitFor(() => expect(result.current.drawer.data?.history).toEqual(history));
    expect(detailGet).toHaveBeenCalledTimes(2);
  });

  it('finishing a bottle from the consumption plan refreshes the goal, the suggestions and the bell', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    goal.mockResolvedValue({ consumed: 3, target: 12 });
    suggestions.mockResolvedValue([{ id: 'g' }]);
    alerts.mockResolvedValue([]);
    counts.mockResolvedValue({ data: { remindersToday: 1 } });
    const { result } = renderHook(() => ({
      goal: useGoalProgress(),
      suggestions: useConsumptionSuggestions(),
      bell: useAlerts(),
      badge: useSidebarCounts(),
      update: useUpdateInventoryItem(),
    }), { wrapper: wrapperOf(qc) });
    await waitFor(() => expect(result.current.goal.data && result.current.suggestions.data && result.current.bell.data && result.current.badge.data).toBeTruthy());
    qc.setQueryData(['inventory'], [flatRow({})]);

    // The stock question after the tasting: "bouteille terminée".
    update.mockResolvedValue({ data: flatRow({ id: 's', parentItemId: 'g', isOpened: true, fillLevel: 0, quantity: 1 }), changed: [{ ...group, quantity: 2 }], removedIds: [] });
    await result.current.update.mutateAsync({ id: 'g', patch: { isOpened: true, fillLevel: 0 } });

    await waitFor(() => {
      expect(goal).toHaveBeenCalledTimes(2);
      expect(suggestions).toHaveBeenCalledTimes(2);
      expect(alerts).toHaveBeenCalledTimes(2);
      expect(counts).toHaveBeenCalledTimes(2);
    });
    // The list holds the new state at once (written in place, not read again).
    expect(qc.getQueryData<{ id: string; quantity: number }[]>(['inventory'])?.find((i) => i.id === 'g')?.quantity).toBe(2);
  });
});
