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

// jsdom does not tell keyboard focus from other focus: ':focus-visible' is stubbed.
let focusVisible = true;
const realMatches = Element.prototype.matches;

describe('UndoToast (#651)', () => {
  beforeEach(() => {
    focusVisible = true;
    Element.prototype.matches = function (sel: string) {
      return sel === ':focus-visible' ? focusVisible : realMatches.call(this, sel);
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    Element.prototype.matches = realMatches;
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
    fireEvent.pointerEnter(toast, { pointerType: 'mouse' });
    advance(UNDO_TIMEOUT_MS * 3);
    expect(onExpire).not.toHaveBeenCalled();
    fireEvent.pointerLeave(toast, { pointerType: 'mouse' });
    advance(UNDO_TIMEOUT_MS + 500);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('is not paused by a tap (touch pointer)', () => {
    const { onExpire } = setup();
    fireEvent.pointerEnter(screen.getByRole('status'), { pointerType: 'touch' });
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
    fireEvent.pointerEnter(toast, { pointerType: 'mouse' });
    advance(UNDO_TIMEOUT_MS);
    fireEvent.pointerLeave(toast, { pointerType: 'mouse' });
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

  it('expires normally after moving the focus to Undo itself (mouse or touch delete)', () => {
    focusVisible = false;
    const { onExpire } = setup({ otherFocus: false });
    advance(500);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
    advance(UNDO_TIMEOUT_MS + 500);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('takes the focus late, as soon as it is lost (slow device)', () => {
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    setup({ otherFocus: false });
    advance(900);
    expect(document.activeElement).toBe(other);
    other.remove();
    advance(300);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Undo' }));
  });

  it('gives the focus to the page title when it closes holding it', () => {
    const h1 = document.createElement('h1');
    document.body.appendChild(h1);
    const { onExpire } = setup({ otherFocus: false });
    advance(500);
    fireEvent.keyDown(screen.getByRole('status'), { key: 'Escape' });
    expect(document.activeElement).toBe(h1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('links the message to the Undo button', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-describedby')).toBe(screen.getByText('Moved to trash').id);
  });

  it('does not steal the focus from another control', () => {
    setup();
    advance(1000);
    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  // Recette v2026.11.3 (8.4): the bar went on moving while the countdown was paused.
  const bar = () => {
    const indicator = Array.from(screen.getByRole('status').querySelectorAll<HTMLElement>('[style]'))
      .find((el) => el.style.transform.startsWith('translateX'));
    if (!indicator) throw new Error('no progress indicator');
    return indicator;
  };

  it('holds its bar still while paused, and goes on from there when resumed', () => {
    setup();
    const toast = screen.getByRole('status');
    advance(UNDO_TIMEOUT_MS / 4);
    fireEvent.pointerEnter(toast, { pointerType: 'mouse' });
    advance(100);
    const paused = bar().style.transform;
    advance(UNDO_TIMEOUT_MS);
    expect(bar().style.transform).toBe(paused);
    fireEvent.pointerLeave(toast, { pointerType: 'mouse' });
    advance(UNDO_TIMEOUT_MS / 4);
    expect(bar().style.transform).toBe('translateX(-50%)');
  });

  it('draws the bar at the timer\'s value, with no easing that would keep it moving after a pause', () => {
    setup();
    expect(bar().className).toContain('transition-none');
  });

  it('pauses under a mouse already resting where it appears (no "enter" then)', () => {
    const { onExpire } = setup();
    fireEvent.pointerMove(screen.getByRole('status'), { pointerType: 'mouse' });
    advance(UNDO_TIMEOUT_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onExpire } = setup();
    fireEvent.keyDown(screen.getByRole('status'), { key: 'Escape' });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
