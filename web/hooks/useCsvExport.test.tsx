import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));

import { notifyError } from '@/lib/toast';
import { useCsvExport } from './useCsvExport';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:csv');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCsvExport (FEAT-99)', () => {
  it('asks for the headers of the interface language and downloads the file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
    vi.stubGlobal('fetch', fetchMock);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = renderHook(() => useCsvExport(), { wrapper });

    result.current.mutate('fr-FR');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/inventory/export.csv?lang=fr', { credentials: 'include' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('falls back to English headers and says so when the export fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCsvExport(), { wrapper });

    result.current.mutate('de');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/inventory/export.csv?lang=en', { credentials: 'include' });
    expect(notifyError).toHaveBeenCalledWith('gdpr.csvError');
  });
});
