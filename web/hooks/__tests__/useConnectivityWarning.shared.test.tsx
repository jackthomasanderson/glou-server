import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../useConnectivity', () => ({ useConnectivity: () => false }));

import { useConnectivityWarning } from '../useConnectivityWarning';

describe('useConnectivityWarning shared dismissal', () => {
  it('dismissing in one place hides the notice in every other place at once', () => {
    const a = renderHook(() => useConnectivityWarning('shared-test'));
    const b = renderHook(() => useConnectivityWarning('shared-test'));
    expect(a.result.current.shouldWarn && b.result.current.shouldWarn).toBe(true);
    act(() => a.result.current.dismiss());
    expect(a.result.current.shouldWarn).toBe(false);
    expect(b.result.current.shouldWarn).toBe(false);
  });
});
