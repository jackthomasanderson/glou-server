import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { HeroUIProvider, Modal, ModalBody, ModalContent, ToastProvider, closeAll } from '@heroui/react';

vi.mock('@/lib/i18n', () => ({ default: { t: (key: string) => key } }));

import { notifyUndoable, UNDO_TIMEOUT_MS } from '@/lib/toast';
import { installClosingOverlayFocusGuard } from '@/lib/closingOverlayFocus';

/**
 * #651 / #836 (WCAG 2.2.1, 2.4.3): the one "Undo" message of the app, as it
 * really renders. Its countdown pauses while the message is hovered by a
 * mouse or holds the keyboard focus, keeps the time already spent, and the
 * focus lost with a deleted card lands on "Undo".
 */

// jsdom does not tell keyboard focus from other focus: ':focus-visible' is stubbed.
let focusVisible = true;
const realMatches = Element.prototype.matches;

const FAKED: NonNullable<Parameters<typeof vi.useFakeTimers>[0]>['toFake'] = ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'setInterval', 'clearInterval', 'performance'];
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
    vi.useFakeTimers({ toFake: FAKED });
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

  // Review of #1018: the real keyboard flow. The trash is confirmed in a
  // dialog that is still closing when the message moves the focus to "Undo";
  // the #875 guard (lib/closingOverlayFocus.ts) is installed as in the app.
  // Focus the message placed itself pauses in keyboard mode: the member is
  // on "Undo", its ring showing.
  it('pauses once it moved the focus to "Undo" while the confirming dialog closes (keyboard)', async () => {
    const uninstall = installClosingOverlayFocusGuard(document);
    try {
      function Confirm() {
        const [open, setOpen] = useState(true);
        return (
          <Modal isOpen={open} onClose={() => setOpen(false)}>
            <ModalContent><ModalBody>
              <button type="button" autoFocus onClick={(e) => {
                const button = e.currentTarget;
                setOpen(false);
                // The server answers: the card that opened the dialog is gone, and the focus with it.
                setTimeout(() => {
                  button.blur();
                  notifyUndoable('familyList.trash.done', { name: 'Cuvée X' }, vi.fn());
                }, 0);
              }}>confirm</button>
            </ModalBody></ModalContent>
          </Modal>
        );
      }
      // Real time until the dialog is shown (its animation code loads asynchronously).
      vi.useRealTimers();
      render(<HeroUIProvider><ToastProvider disableAnimation /><Confirm /></HeroUIProvider>);
      await waitFor(() => expect(document.querySelector('[aria-modal="true"][data-open]')).not.toBeNull());
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
      vi.useFakeTimers({ toFake: FAKED });
      act(() => screen.getByRole('button', { name: 'confirm' }).click());
      // The answer, then the message's focus watch.
      advance(10);
      advance(200);
      // The dialog is still closing, the focus is on "Undo".
      expect(document.querySelector('[aria-modal="true"]:not([data-open])')).not.toBeNull();
      expect(document.activeElement).toBe(undoButton());
      advance(UNDO_TIMEOUT_MS * 3);
      expect(expired()).toBe(false);
    } finally {
      uninstall();
    }
  });
});

