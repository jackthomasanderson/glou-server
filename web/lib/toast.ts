'use client';
import { createElement } from 'react';
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
 * leaving — its 16 px hover margins included — lets every click through.
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
    motionDiv: 'data-[placement=bottom-right]:right-[var(--toast-inset-right,0px)]',
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

export function notifyError(messageKey: string, values?: Record<string, unknown>): void {
  addToast({
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

/**
 * A success that can be taken back (#471, ux-ui.md §10.4: "1 bouteille
 * ouverte · Annuler"). The toast region is a top layer: its button works
 * above an open drawer without closing it. Pressing "Annuler" closes the
 * message and calls `onUndo` once. `extra`, a second action of the same
 * message (FEAT-109: « Noter une dégustation » after « J'en bois une »),
 * also closes it.
 */
export function notifyUndoable(
  messageKey: string,
  values: Record<string, unknown> | undefined,
  onUndo: () => void,
  extra?: { labelKey: string; onPress: () => void },
): void {
  let done = false;
  const once = (action: () => void) => () => {
    if (done) return;
    done = true;
    if (key) closeToast(key);
    action();
  };
  const button = (label: string, onPress: () => void) =>
    createElement(Button, { key: label, size: 'sm', variant: 'flat', color: 'success', onPress }, label);
  const undo = button(translate('actions.undo'), once(onUndo));
  // Two actions go under the message, not beside it: beside, they left the
  // message a word's width and cut it mid-word on a phone (« 1 / bout / eille
  // / bue », recette v3 of #471).
  const key = addToast({
    title: translate(messageKey, values),
    color: 'success',
    timeout: UNDO_TIMEOUT_MS,
    ...(extra
      ? { description: createElement('div', { className: 'flex flex-wrap gap-1 mt-1' }, button(translate(extra.labelKey), once(extra.onPress)), undo) }
      : { endContent: undo }),
  });
}
