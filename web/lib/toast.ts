'use client';
import { addToast } from '@heroui/react';
import type { TOptions } from 'i18next';
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

export function notifySuccess(messageKey: string, values?: TOptions): void {
  addToast({
    title: i18n.t(messageKey, values),
    color: 'success',
    timeout: SUCCESS_TIMEOUT_MS,
  });
}

export function notifyError(messageKey: string, values?: TOptions): void {
  addToast({
    title: i18n.t(messageKey, values),
    color: 'danger',
    timeout: PERSISTENT_TIMEOUT,
  });
}
