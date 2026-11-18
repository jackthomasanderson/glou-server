import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from '../useDebouncedValue';

afterEach(() => vi.useRealTimers());

describe('useDebouncedValue', () => {
  it('follows the value only once it has been still for the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 600), { initialProps: { v: 'a' } });
    expect(result.current).toBe('a');
    rerender({ v: 'ab' });
    act(() => { vi.advanceTimersByTime(400); });
    rerender({ v: 'abc' });
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('abc');
  });
});
