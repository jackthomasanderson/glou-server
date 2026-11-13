import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { HeroUIProvider, ToastProvider, closeAll } from '@heroui/react';

vi.mock('@/lib/i18n', () => ({ default: { t: (key: string) => key } }));

import { notifyUndoable, UNDO_TIMEOUT_MS } from '@/lib/toast';

/**
 * #651 / #836 (WCAG 2.2.1, 2.4.3): the one "Undo" message of the app, as it
 * really renders. Its countdown pauses while the message is hovered by a
 * mouse or holds the keyboard focus, keeps the time already spent, and the
 * focus lost with a deleted card lands on "Undo".
 */

// jsdom does not tell keyboard focus from other focus: ':focus-visible' is stubbed.
let focusVisible = true;
const realMatches = Element.prototype.matches;

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const undoButton = () => screen.queryByRole('button', { name: 'actions.undo' });
const toast = () => undoButton()?.closest<HTMLElement>('[data-toast]') ?? null;
/** Expired: the message is closing (it then slides away for a while). */
const expired = () => !undoButton() || toast()?.getAttribute('data-toast-exiting') === 'true' || !document.body.contains(undoButton());

function setup({ otherFocus = true } = {}) {
  const onUndo = vi.fn();
  if (otherFocus) {
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
  }
  render(<HeroUIProvider disableAnimation><ToastProvider disableAnimation /></HeroUIProvider>);
  act(() => notifyUndoable('familyList.trash.done', { name: 'Cuvée X' }, onUndo));
  expect(undoButton()).not.toBeNull();
  return { onUndo };
}

describe('notifyUndoable timing and focus (#651, #836)', () => {
  beforeEach(() => {
    focusVisible = true;
    Element.prototype.matches = function (sel: string) {
      return sel === ':focus-visible' ? focusVisible : realMatches.call(this, sel);
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'setInterval', 'clearInterval', 'performance'] });
  });
  afterEach(() => {
    act(() => closeAll());
    advance(1000);
    Element.prototype.matches = realMatches;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('expires after the undo delay', () => {
    setup();
    advance(UNDO_TIMEOUT_MS - 500);
    expect(expired()).toBe(false);
    advance(1000);
    expect(expired()).toBe(true);
  });

  it('does not expire while the keyboard focus is inside, and resumes when it leaves', () => {
    setup();
    const button = undoButton()!;
    act(() => button.focus());
    advance(UNDO_TIMEOUT_MS * 3);
    expect(expired()).toBe(false);
    const other = document.querySelector('input')!;
    act(() => other.focus());
    advance(UNDO_TIMEOUT_MS + 500);
    expect(expired()).toBe(true);
  });

  it('does not expire while hovered by a mouse, and resumes when left', () => {
    setup();
    const el = toast()!;
    fireEvent.pointerOver(el, { pointerType: 'mouse' });
    advance(UNDO_TIMEOUT_MS * 3);
    expect(expired()).toBe(false);
    fireEvent.pointerOut(el, { pointerType: 'mouse', relatedTarget: document.body });
    fireEvent.pointerOver(document.body, { pointerType: 'mouse' });
    advance(UNDO_TIMEOUT_MS + 500);
    expect(expired()).toBe(true);
  });

  it('is not paused by a tap (touch pointer)', () => {
    setup();
    fireEvent.pointerOver(toast()!, { pointerType: 'touch' });
    advance(UNDO_TIMEOUT_MS + 500);
    expect(expired()).toBe(true);
  });

  it('keeps the time already spent when paused', () => {
    setup();
    advance(UNDO_TIMEOUT_MS - 1000);
    fireEvent.pointerOver(toast()!, { pointerType: 'mouse' });
    advance(UNDO_TIMEOUT_MS);
    fireEvent.pointerOver(document.body, { pointerType: 'mouse' });
    advance(500);
    expect(expired()).toBe(false);
    advance(1000);
    expect(expired()).toBe(true);
  });

  it('moves the focus to "Undo" when it was lost with the deleted card', () => {
    setup({ otherFocus: false });
    expect(document.activeElement).toBe(document.body);
    advance(1000);
    expect(document.activeElement).toBe(undoButton());
  });

  it('expires normally after moving the focus to "Undo" itself (mouse or touch delete)', () => {
    focusVisible = false;
    setup({ otherFocus: false });
    advance(500);
    expect(document.activeElement).toBe(undoButton());
    advance(UNDO_TIMEOUT_MS + 500);
    expect(expired()).toBe(true);
  });

  it('does not steal the focus from another control', () => {
    setup();
    advance(1000);
    expect(document.activeElement?.tagName).toBe('INPUT');
  });

  it('gives the focus to the page title, not <body>, when "Undo" is pressed', () => {
    const h1 = document.createElement('h1');
    document.body.appendChild(h1);
    const { onUndo } = setup({ otherFocus: false });
    advance(500);
    fireEvent.click(undoButton()!);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(h1);
  });

  it('shows no countdown bar, like every other message', () => {
    setup();
    expect(toast()!.querySelector('[role="progressbar"]')).toBeNull();
  });
});
