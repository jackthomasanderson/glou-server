'use client';
import { createElement, useEffect, useState, type ReactNode } from 'react';
import { addToast, Button, closeToast } from '@heroui/react';
import i18n from '@/lib/i18n';

/**
 * Centralised action feedback (ux-ui.md 5.3 "Feedback d'interaction" and 9.4
 * "Succès & Confirmation").
 *
 * Every create / update / delete in the app must confirm itself through these
 * two helpers so the wording, colour, placement and lifetime of a notification
 * stay identical everywhere, instead of each page rolling its own banner.
 *
 * They take an i18n key (never a literal) and translate it at call time
 * against the shared i18next instance, which makes them usable both from React
 * components and from the mutation hooks that own the server round-trip.
 */

/** The CSS variable holding the room kept free right of the messages (lib/toastClearance.ts: a drawer). */
export const TOAST_INSET_VAR = '--toast-inset-right';

/**
 * Every message is read whole: HeroUI cuts a toast's title to one line
 * (« Bouteille remise avec les a… », recette #471). Beside a drawer, a
 * message keeps clear of it ({@link TOAST_INSET_VAR}, recette n°5 bis of
 * #847). Given to ToastProvider.
 *
 * Leaving, a message slid sideways by its own width: beside a drawer
 * (bottom-right), straight over the drawer's « Ajouter des bouteilles » and
 * « Modifier », and it caught a click meant for them (recette n°5 ter of
 * #847). There it now leaves downwards, in its own column; and a message
 * leaving — its 16 px hover margins and the box HeroUI places it with
 * (whose inline `pointer-events: all` only `!` outranks) included — lets
 * every click through.
 */
export const TOAST_PROPS = {
  classNames: {
    base: [
      'data-[toast-exiting=true]:pointer-events-none',
      'data-[toast-exiting=true]:before:pointer-events-none',
      'data-[toast-exiting=true]:after:pointer-events-none',
      'data-[toast-exiting=true]:data-[placement=bottom-right]:translate-x-0',
      'data-[toast-exiting=true]:data-[placement=bottom-right]:translate-y-full',
    ].join(' '),
    title: 'whitespace-normal break-words',
    motionDiv: 'data-[placement=bottom-right]:right-[var(--toast-inset-right,0px)] has-[[data-toast-exiting=true]]:pointer-events-none!',
  },
};

/** Success notifications are transient (ux-ui.md 9.4: 3 seconds). */
const SUCCESS_TIMEOUT_MS = 3000;

/**
 * A falsy timeout disables HeroUI's auto-dismiss countdown, which is what
 * ux-ui.md 5.3 asks for on errors: stay until the user closes it.
 */
const PERSISTENT_TIMEOUT = 0;

// i18next >= 25.10 types `t(key, undefined)` as the (key, defaultValue) overload.
function translate(messageKey: string, values?: Record<string, unknown>): string {
  return values ? i18n.t(messageKey, values) : i18n.t(messageKey);
}

export function notifySuccess(messageKey: string, values?: Record<string, unknown>): void {
  addToast({
    title: translate(messageKey, values),
    color: 'success',
    timeout: SUCCESS_TIMEOUT_MS,
  });
}

/** Returns the message's key, for a caller that must close it itself (hooks/useValidationNotice.ts). */
export function notifyError(messageKey: string, values?: Record<string, unknown>): string | null {
  return addToast({
    title: translate(messageKey, values),
    color: 'danger',
    timeout: PERSISTENT_TIMEOUT,
  });
}

/** A heads-up the member should read (a file too long for the next step): stays until closed, in the warning colour. */
export function notifyWarning(messageKey: string, values?: Record<string, unknown>): void {
  addToast({
    title: translate(messageKey, values),
    color: 'warning',
    timeout: PERSISTENT_TIMEOUT,
  });
}

/** ux-ui.md §10.4: an everyday action is undone from its message for 8 seconds (decision #471 point 71). */
export const UNDO_TIMEOUT_MS = 8000;

// A closing confirmation hands the focus back to a card that no longer
// exists, so it ends on <body>. Watch for that for a while (a slow phone can
// take more than a second) and bring it to "Undo" as soon as it lands there.
const FOCUS_WATCH_MS = 1500;
const FOCUS_POLL_MS = 100;

const isFocusLost = () => {
  const active = document.activeElement;
  return !active || active === document.body || active === document.documentElement;
};

/** A message closing while it holds the focus gives it to the page title, never to <body>. */
function releaseFocus(toast: Element | null) {
  if (!toast?.contains(document.activeElement)) return;
  const heading = document.querySelector<HTMLElement>('main h1, h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
}

/**
 * The actions of an undoable message, and its countdown (#651, WCAG 2.2.1
 * and 2.4.3). HeroUI's own timer only stops under the mouse; this one also
 * stops while the message holds the keyboard focus, and keeps the time
 * already spent. Listened on the document: HeroUI re-renders the message
 * elsewhere when a drawer opens or closes.
 */
function UndoActions({ id, onExpire, className, children }: { id: string; onExpire: () => void; className?: string; children?: ReactNode }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!node) return;
    const inside = (target: EventTarget | null) => target instanceof Node && !!undoToastOf(id)?.contains(target);
    let hovered = false;
    let focused = false;
    let remaining = UNDO_TIMEOUT_MS;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      if (hovered || focused) {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
        remaining -= Date.now() - startedAt;
      } else if (timer === undefined) {
        startedAt = Date.now();
        timer = setTimeout(onExpire, remaining);
      }
    };
    // A mouse pointer only: a tap emulates hover with no "leave" until the next tap.
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      hovered = inside(e.target);
      sync();
    };
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget !== null) return;
      hovered = false;
      sync();
    };
    // Keyboard focus pauses (':focus-visible'), including the focus the message
    // moved to "Undo" itself after a keyboard action: the member is on "Undo",
    // its ring showing. After a mouse or a tap it does not (no ring), so the
    // message still goes on its own.
    const onFocusIn = (e: FocusEvent) => {
      focused = inside(e.target) && (e.target as Element).matches(':focus-visible');
      sync();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (inside(e.relatedTarget)) return;
      focused = false;
      sync();
    };
    // Polled: removing a focused element fires no focusout in every browser.
    const poll = setInterval(() => {
      if (isFocusLost()) node.querySelector<HTMLElement>('[data-undo]')?.focus();
    }, FOCUS_POLL_MS);
    const stopPoll = setTimeout(() => clearInterval(poll), FOCUS_WATCH_MS);
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    // Captured: heard before any listener below can stop the event (the #875
    // guard, lib/closingOverlayFocus.ts, while a confirming dialog closes).
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    sync();
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      clearTimeout(stopPoll);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [node, id, onExpire]);
  return createElement('div', { ref: setNode, className, 'data-undo-id': id }, children);
}

let undoSeq = 0;

/** The message holding an undoable message's actions. */
function undoToastOf(id: string): Element | null {
  const actions = document.querySelector(`[data-undo-id="${id}"]`);
  return actions?.closest('[data-toast]') ?? actions;
}

/**
 * A success that can be taken back (#471, ux-ui.md §10.4: "1 bouteille
 * ouverte · Annuler"), and the only "Undo" of the app (#836): a wine put in
 * the trash too. The toast region is a top layer: its button works above an
 * open drawer without closing it. Pressing "Annuler" closes the message and
 * calls `onUndo` once. `extra`, a second action of the same message
 * (FEAT-109: « Noter une dégustation » after « J'en bois une »), also closes
 * it.
 */
export function notifyUndoable(
  messageKey: string,
  values: Record<string, unknown> | undefined,
  onUndo: () => void,
  extra?: { labelKey: string; onPress: () => void },
): void {
  let done = false;
  const id = `undo-${++undoSeq}`;
  const close = () => {
    done = true;
    releaseFocus(undoToastOf(id));
    if (key) closeToast(key);
  };
  const once = (action: () => void) => () => {
    if (done) return;
    close();
    action();
  };
  const button = (label: string, onPress: () => void, isUndo = false) =>
    createElement(Button, { key: label, size: 'sm', variant: 'flat', color: 'success', onPress, ...(isUndo ? { 'data-undo': true } : {}) }, label);
  const undo = button(translate('actions.undo'), once(onUndo), true);
  // Two actions go under the message, not beside it: beside, they left the
  // message a word's width and cut it mid-word on a phone (« 1 / bout / eille
  // / bue », recette v3 of #471).
  const key = addToast({
    title: translate(messageKey, values),
    color: 'success',
    // The countdown is UndoActions' own, which also pauses on keyboard focus.
    timeout: PERSISTENT_TIMEOUT,
    ...(extra
      ? { description: createElement(UndoActions, { id, onExpire: close, className: 'flex flex-wrap gap-1 mt-1' }, button(translate(extra.labelKey), once(extra.onPress)), undo) }
      : { endContent: createElement(UndoActions, { id, onExpire: close }, undo) }),
  });
}
