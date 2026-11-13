import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// #887: a find that fails to record is said once — by RecordFoundItemModal,
// which gives the reason — not also by a generic message of the hook.

const notifyError = vi.fn();
const recordFoundItem = vi.fn();
vi.mock('@/lib/toast', () => ({ notifyError: (...args: unknown[]) => notifyError(...args) }));
vi.mock('@/lib/inventory-count/client', () => ({ inventoryCountClient: { recordFoundItem: (...args: unknown[]) => recordFoundItem(...args) } }));

import { useRecordFoundItem } from '../useInventoryCount';
import { createQueryClient } from '@/lib/queryClient';

const wrapper = ({ children }: { children?: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
);

describe('useRecordFoundItem failure (#887)', () => {
  beforeEach(() => { notifyError.mockReset(); recordFoundItem.mockReset(); });

  it('shows no message of its own: the form says it', async () => {
    recordFoundItem.mockRejectedValue(new Error('SESSION_NOT_ACTIVE'));
    const { result } = renderHook(() => useRecordFoundItem('s1'), { wrapper });
    await act(async () => { await result.current.mutateAsync({ name: 'X', category: 'wine' }).catch(() => {}); });
    expect(notifyError).not.toHaveBeenCalled();
  });
});
