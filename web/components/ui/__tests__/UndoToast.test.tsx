import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { UndoToast } from '../UndoToast';
import { UNDO_TIMEOUT_MS } from '@/lib/toast';

// #651 (WCAG 2.2.1, 2.4.3): the countdown pauses while the toast is hovered
// or holds the focus, and the focus lands on "Undo" once the deleted card is gone.
// By default another control holds the focus, so the toast leaves it alone.
function setup({ otherFocus = true } = {}) {
  const onExpire = vi.fn();
  if (otherFocus) {
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
  }
  render(<UndoToast message="Moved to trash" undoLabel="Undo" onUndo={vi.fn()} onExpire={onExpire} />);
  return { onExpire };
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('UndoToast (#651)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] }));
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('expires after the undo delay', () => {
    const { onExpire } = setup();
    advance(UNDO_TIMEOUT_MS - 500);
    expect(onExpire).not.toHaveBeenCalled();
    advance(1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not expire while hovered, and resumes when left', () => {
    const { onExpire } = setup();
    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    advance(UNDO_TIMEOUT_MS * 3);
    expect(onExpire).not.toHaveBeenCalled();
    fireEvent.mouseLeave(toast);
    advance(UNDO_TIMEOUT_MS + 500);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not expire while the focus is inside, and resumes when it leaves', () => {
    const { onExpire } = setup();
    const button = screen.getByRole('button', { name: 'Undo' });
    act(() => button.focus());
    advance(UNDO_TIMEOUT_MS * 3);
    expect(onExpire).not.toHaveBeenCalled();
    act(() => button.blur());
    advance(UNDO_TIMEOUT_MS + 500);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('keeps the time already spent when paused', () => {
    const { onExpire } = setup();
    const toast = screen.getByRole('status');
    advance(UNDO_TIMEOUT_MS - 1000);
    fireEvent.mouseEnter(toast);
    advance(UNDO_TIMEOUT_MS);
    fireEvent.mouseLeave(toast);
    advance(500);
    expect(onExpire).not.toHaveBeenCalled();
    advance(1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('moves the focus to Undo when it was lost with the deleted card', () => {
    setup({ otherFocus: false });
    expect(document.activeElement).toBe(document.body);
    advance(1000);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
  });

  it('does not steal the focus from another control', () => {
    setup();
    advance(1000);
    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  it('closes on Escape', () => {
    const { onExpire } = setup();
    fireEvent.keyDown(screen.getByRole('status'), { key: 'Escape' });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
