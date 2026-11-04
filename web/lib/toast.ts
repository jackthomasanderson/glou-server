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
  const key = addToast({
    title: translate(messageKey, values),
    color: 'success',
    timeout: UNDO_TIMEOUT_MS,
    endContent: extra
      ? createElement('div', { className: 'flex gap-1' }, button(translate(extra.labelKey), once(extra.onPress)), undo)
      : undo,
  });
}
