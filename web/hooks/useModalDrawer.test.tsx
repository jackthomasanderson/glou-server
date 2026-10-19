// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useModalDrawer } from './useModalDrawer';

function Harness({ open }: { open: boolean }) {
  const { overlayRef, panelRef } = useModalDrawer(open);
  return (
    <div>
      <button data-testid="behind">behind</button>
      <div ref={overlayRef}>
        <div ref={panelRef} tabIndex={-1} role="dialog" data-testid="panel" />
      </div>
    </div>
  );
}

describe('useModalDrawer (#358)', () => {
  it('focuses the panel, inerts what is behind, and restores focus on close', async () => {
    vi.useFakeTimers();
    const { rerender, getByTestId } = render(<Harness open={false} />);
    const behind = getByTestId('behind');
    behind.focus();

    rerender(<Harness open />);
    expect(document.activeElement).toBe(getByTestId('panel'));
    expect(behind.hasAttribute('inert')).toBe(true);

    rerender(<Harness open={false} />);
    await act(async () => { vi.runAllTimers(); });
    expect(behind.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(behind);
    vi.useRealTimers();
  });
});
