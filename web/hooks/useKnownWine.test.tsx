import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #471 (FEAT-97 c1): the wine typed is looked up once category, producer and
// name are there and typing pauses; nothing is proposed meanwhile, nor when
// the lookup fails (offline): the entry is never blocked.

const match = vi.fn();
vi.mock('@/lib/products/client', () => ({ productsClient: { match: (...args: unknown[]) => match(...args) } }));

import { useKnownWine, type KnownWineFields } from './useKnownWine';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const cuveeX = { id: 'p1', name: 'Cuvée X' };

beforeEach(() => {
  match.mockReset();
  match.mockResolvedValue([cuveeX]);
});

describe('useKnownWine', () => {
  it('looks the wine up by its key once typing pauses, then answers the wines found', async () => {
    const { result } = renderHook(
      () => useKnownWine({ category: 'wine', producer: ' Domaine Y ', name: 'Cuvée X', vintage: 2020 }), { wrapper },
    );
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual([cuveeX]));
    expect(match).toHaveBeenCalledOnce();
    expect(match).toHaveBeenCalledWith({ category: 'wine', producer: 'Domaine Y', name: 'Cuvée X', vintage: 2020, format: null });
  });

  it('asks nothing while the producer or the name is missing, or when turned off', async () => {
    const { result, rerender } = renderHook(
      ({ fields, enabled }: { fields: KnownWineFields; enabled: boolean }) => useKnownWine(fields, enabled),
      { wrapper, initialProps: { fields: { category: 'wine', producer: 'Domaine Y', name: '  ' }, enabled: true } },
    );
    rerender({ fields: { category: 'wine', producer: 'Domaine Y', name: 'Cuvée X' }, enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(match).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('forgets the previous wine as soon as the name typed changes', async () => {
    const { result, rerender } = renderHook(
      ({ fields }: { fields: KnownWineFields }) => useKnownWine(fields),
      { wrapper, initialProps: { fields: { category: 'wine', producer: 'Domaine Y', name: 'Cuvée X', vintage: 2020 } } },
    );
    await waitFor(() => expect(result.current).toEqual([cuveeX]));

    match.mockResolvedValue([]);
    rerender({ fields: { category: 'wine', producer: 'Domaine Y', name: 'Cuvée X', vintage: 2019 } });
    expect(result.current).toEqual([]);
    await waitFor(() => expect(match).toHaveBeenCalledTimes(2));
  });

  it('asks every vitola of a cigar wished for without one', async () => {
    renderHook(() => useKnownWine({ category: 'cigar', producer: 'Montecristo', name: 'No. 2', anyFormat: true }), { wrapper });
    await waitFor(() => expect(match).toHaveBeenCalledWith({
      category: 'cigar', producer: 'Montecristo', name: 'No. 2', vintage: null, format: null, anyFormat: true,
    }));
  });

  it('proposes nothing when the lookup fails', async () => {
    match.mockRejectedValue(new Error('NETWORK_ERROR'));
    const { result } = renderHook(() => useKnownWine({ category: 'cigar', producer: 'Montecristo', name: 'No. 2', format: 'Robusto' }), { wrapper });
    await waitFor(() => expect(match).toHaveBeenCalledWith(expect.objectContaining({ format: 'Robusto', vintage: null })));
    expect(result.current).toEqual([]);
  });
});
