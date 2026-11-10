'use client';
import { useEffect, useRef } from 'react';
import { confirmLeave, registerLeaveQuestion } from '@/lib/leaveGuard';

/** Marks the extra history entry, so turning the guard off and on again adds no second one. */
const SENTINEL = '__glouLeaveGuard';

function onSentinel(): boolean {
  return !!(window.history.state as Record<string, unknown> | null)?.[SENTINEL];
}

function pushSentinel() {
  const state: unknown = window.history.state;
  window.history.pushState({ ...(state && typeof state === 'object' ? state : {}), [SENTINEL]: true }, '', window.location.href);
}

/**
 * #759: while `active`, leaving the page asks first:
 * - a reload, a closed tab or a typed address: the browser's own question
 *   (`beforeunload`);
 * - a link of the app, which Next.js follows without unloading the page:
 *   `message`, and the link is not followed unless the person confirms;
 * - the code that leaves by `router.push` (menus, search, notifications,
 *   sign-out) asks through `confirmLeave()` (lib/leaveGuard);
 * - Back (button, phone gesture): an extra history entry (same address) is
 *   kept on top while active, so Back first lands on it; then `message` is
 *   asked, and the page either stays (the entry is put back) or really goes
 *   back. Once nothing is left to lose, the extra entry is taken away again.
 */
export function useLeaveGuard(active: boolean, message: string) {
  // A confirmed Back is under way: the browser must not ask a second time.
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const unregister = registerLeaveQuestion(message);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
      // Older browsers only ask when a value is set.
      event.returnValue = '';
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!confirmLeave()) {
        event.preventDefault();
        // Before Next.js's own handler on the app root, so the route does not change.
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, message]);

  // Back: keyed on `active` only, so a change of language does not touch history.
  useEffect(() => {
    if (!active) return;
    if (!onSentinel()) pushSentinel();
    leavingRef.current = false;
    const onPopState = () => {
      if (leavingRef.current) return;
      // The step lands on the same address: Next.js's router, which may see
      // it too (in Chromium, window listeners run in the order they were
      // added), restores the same page.
      if (confirmLeave()) {
        leavingRef.current = true;
        window.removeEventListener('popstate', onPopState, true);
        window.history.back();
      } else {
        pushSentinel();
      }
    };
    window.addEventListener('popstate', onPopState, true);
    return () => {
      window.removeEventListener('popstate', onPopState, true);
      // Nothing left to lose (saved, or the edit undone) while still on the
      // page: take the extra entry away, so the next Back really goes back.
      // Left by navigation, the current entry is the new page's: nothing to do.
      if (!leavingRef.current && onSentinel()) {
        window.addEventListener('popstate', (event) => event.stopImmediatePropagation(), { capture: true, once: true });
        window.history.back();
      }
    };
  }, [active]);
}
