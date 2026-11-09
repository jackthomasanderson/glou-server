import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #698: the action-type filter reaches the API as one comma-separated list.
const { get } = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: { items: [], meta: { page: 1, limit: 50, total: 0, pages: 0 } } }),
}));
vi.mock('../lib/api', () => ({ client: { get } }));

import { useAdminAuditLogs } from './useAdmin';

describe('useAdminAuditLogs', () => {
  it('sends the chosen action types with the other filters', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useAdminAuditLogs(1, 50, { q: 'alice', actions: ['LOGIN', 'LOGOUT'], status: '' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith('/admin/audit-logs?page=1&limit=50&q=alice&actions=LOGIN%2CLOGOUT');
  });
});
