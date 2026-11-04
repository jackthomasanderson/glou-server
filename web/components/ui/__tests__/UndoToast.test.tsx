import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { UndoToast } from '../UndoToast';

describe('UndoToast (decision #471 point 71)', () => {
  afterEach(() => vi.useRealTimers());

  it('offers « Annuler » for 8 seconds, like every other undo message', () => {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const onExpire = vi.fn();
    render(<UndoToast message="1 bouteille à la corbeille" undoLabel="Annuler" onUndo={() => {}} onExpire={onExpire} />);
    act(() => { vi.advanceTimersByTime(7_900); });
    expect(onExpire).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
