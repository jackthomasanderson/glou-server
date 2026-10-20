import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewMode } from './useViewMode';
import { usePageSize } from './usePageSize';

describe('persisted UI preferences (#139)', () => {
  beforeEach(() => window.localStorage.clear());

  it('reads a view mode saved under the pre-#139 key and migrates it', () => {
    window.localStorage.setItem('viewMode:bottles', 'list');
    const { result } = renderHook(() => useViewMode('bottles'));
    expect(result.current[0]).toBe('list');
    expect(window.localStorage.getItem('glou:view-mode:bottles')).toBe('list');
  });

  it('ignores an invalid stored page size and saves new choices under glou:', () => {
    window.localStorage.setItem('glou:page-size:bottles', '7');
    const { result } = renderHook(() => usePageSize('bottles'));
    expect(result.current[0]).toBe(25);
    act(() => result.current[1](50));
    expect(window.localStorage.getItem('glou:page-size:bottles')).toBe('50');
  });
});
