'use client';
import { useEffect } from 'react';
import { confirmLeave, registerLeaveQuestion } from '@/lib/leaveGuard';

/** Marks the extra history entry, so turning the guard off and on again adds no second one. */
const SENTINEL = '__glouLeaveGuard';

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
 * - Back (button, phone gesture): an extra history entry is kept on top
 *   while active, so Back first lands on it; then `message` is asked, and
 *   the page either stays (the entry is put back) or really goes back.
 */
export function useLeaveGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    const unregister = registerLeaveQuestion(message);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
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

    // The entry Back lands on first: same address, same router state.
    if (!(window.history.state as Record<string, unknown> | null)?.[SENTINEL]) pushSentinel();
    let leaving = false;
    const onPopState = (event: PopStateEvent) => {
      if (leaving) return;
      // Captured, so Next.js's router does not see this step.
      event.stopImmediatePropagation();
      if (confirmLeave()) {
        leaving = true;
        window.removeEventListener('popstate', onPopState, true);
        window.removeEventListener('beforeunload', onBeforeUnload);
        window.history.back();
      } else {
        pushSentinel();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState, true);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState, true);
    };
  }, [active, message]);
}
