import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CSV_IMPORT_TRANSACTION_MAX_WAIT_MS, CSV_IMPORT_TRANSACTION_TIMEOUT_MS } from '@shared/import';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));

import { notifyError } from '@/lib/toast';
import { useCsvConfirm, useCsvPreview } from './useImport';

// FEAT-91 (#641): a failed import showed nothing (the button just stopped
// spinning), and the screen gave up after 15 s while the server allowed
// itself 60 — on a small server, an import could succeed behind a silent
// screen and invite a second click.

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const rows = [{ name: 'Talbot', producer: 'Château Talbot', category: 'wine' as const }];

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCsvConfirm', () => {
  it('says so when the import fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'UNEXPECTED_ERROR' }) }));
    const { result } = renderHook(() => useCsvConfirm(), { wrapper });

    result.current.mutate({ rows, cellarId: null });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith('onboarding.csv.confirmError');
  });

  it.each(['LINE_TOO_LARGE', 'QUANTITY_TOO_LARGE'])('explains a refusal %s', async (code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: code }) }));
    const { result } = renderHook(() => useCsvConfirm(), { wrapper });

    result.current.mutate({ rows, cellarId: null });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyError).toHaveBeenCalledWith(`onboarding.csv.confirmErrors.${code}`);
  });

  it('waits for the server to finish the import, not just the usual 15 s', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { bottles: 1, wines: 1, cigars: 0, cigarReferences: 0, skippedLines: 0, skippedUnits: 0, staleLines: 0, createdCellars: [] } }) }));
    const { result } = renderHook(() => useCsvConfirm(), { wrapper });

    result.current.mutate({ rows, cellarId: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const waited = timeout.mock.calls[0]?.[0] ?? 0;
    expect(waited).toBeGreaterThan(CSV_IMPORT_TRANSACTION_TIMEOUT_MS + CSV_IMPORT_TRANSACTION_MAX_WAIT_MS);
  });
});

describe('useCsvPreview', () => {
  const file = new File(['x'], 'cave.csv', { type: 'text/csv' });

  it('reports the server\'s reason for refusing the file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'INVALID_FILE_TYPE' }) }));
    const { result } = renderHook(() => useCsvPreview(), { wrapper });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.error?.message).toBe('INVALID_FILE_TYPE'));
  });

  // A sign-in portal (forward auth) can answer 200 with its own login page.
  it('treats a page that is not the API\'s answer as an unexpected error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('not json'); } }));
    const { result } = renderHook(() => useCsvPreview(), { wrapper });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.error?.message).toBe('UNEXPECTED_ERROR'));
  });

  // A reverse proxy in front of the app answers an oversized upload with its
  // own HTML page, not the API's JSON.
  it('recognises a file too large for a reverse proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413, json: async () => { throw new SyntaxError('not json'); } }));
    const { result } = renderHook(() => useCsvPreview(), { wrapper });

    result.current.mutate(file);

    await waitFor(() => expect(result.current.error?.message).toBe('FILE_TOO_LARGE'));
  });
});
