/**
 * #759: what the page asks before it is left while it holds unsaved changes.
 * A screen with such changes registers its question (useLeaveGuard); every
 * place that leaves the page by code (`router.push` from a menu, a search
 * result, a notification, sign-out) goes through {@link leaveThen}.
 */
const questions = new Set<string>();

/** While registered, leaving asks `question`. Returns the unregister function. */
export function registerLeaveQuestion(question: string): () => void {
  // One entry per registration, even when two screens ask the same thing.
  const entry = new String(question) as unknown as string;
  questions.add(entry);
  return () => {
    questions.delete(entry);
  };
}

/** Whether a screen holds unsaved changes. */
export function hasLeaveQuestion(): boolean {
  return questions.size > 0;
}

/** True when the page may be left: nothing pending, or the person confirmed. */
export function confirmLeave(): boolean {
  const [question] = questions;
  return question === undefined || window.confirm(String(question));
}

/**
 * The extra history entry (same address) a guarded page keeps on top, so
 * that Back first lands on the page itself (useLeaveGuard).
 */
const LEAVE_ENTRY = '__glouLeaveGuard';

/** Whether the current history entry is that extra entry. */
export function onLeaveEntry(): boolean {
  return !!(window.history.state as Record<string, unknown> | null)?.[LEAVE_ENTRY];
}

/** Adds the extra entry on top, at `url` (the current address by default). */
export function pushLeaveEntry(url: string = window.location.href): void {
  const state: unknown = window.history.state;
  window.history.pushState({ ...(state && typeof state === 'object' ? state : {}), [LEAVE_ENTRY]: true }, '', url);
}

let steppingOff = false;

/** A confirmed exit is stepping off the extra entry: the Back it causes is not the person's. */
export function isSteppingOff(): boolean {
  return steppingOff;
}

/**
 * #920: runs `go` (a navigation) from the page's own entry, never from the
 * extra one. Leaving from the extra entry kept it in history
 * ([P, page, page, B]): from B, Back went to the page, and the next Back
 * did nothing. Stepping off first leaves [P, page, B].
 */
export function stepOffThen(go: () => void): void {
  if (!onLeaveEntry()) {
    go();
    return;
  }
  steppingOff = true;
  window.addEventListener('popstate', (event) => {
    // The page's own entry, same address: nothing for the router to do.
    event.stopImmediatePropagation();
    steppingOff = false;
    go();
  }, { capture: true, once: true });
  window.history.back();
}

/** Asks first (see {@link confirmLeave}); once confirmed, leaves through {@link stepOffThen}. */
export function leaveThen(go: () => void): boolean {
  if (!confirmLeave()) return false;
  stepOffThen(go);
  return true;
}

let staleEntryStepInstalled = false;

/**
 * #920: an extra entry can outlive its question: Back confirmed from the page
 * (the entry is then ahead in history), or a page left by an address typed or
 * a redirect. Landing on it while nothing is left to lose would be a step that
 * does nothing; it is stepped over, back to the page's own entry.
 * Browsers cannot drop an entry that is ahead, so Forward onto it at the end
 * of history comes back to the page: Forward then does nothing visible, like
 * on the last entry.
 */
export function installStaleEntryStep(): void {
  if (staleEntryStepInstalled) return;
  staleEntryStepInstalled = true;
  window.addEventListener('popstate', (event) => {
    if (steppingOff || hasLeaveQuestion() || !onLeaveEntry()) return;
    event.stopImmediatePropagation();
    window.history.back();
  }, true);
}
