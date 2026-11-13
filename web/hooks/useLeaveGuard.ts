'use client';
import { useEffect, useRef } from 'react';
import {
  confirmLeave, installStaleEntryStep, isSteppingOff, onLeaveEntry, pushLeaveEntry, registerLeaveQuestion, stepOffThen,
} from '@/lib/leaveGuard';

/** The part of the Navigation API used here (not in every browser yet). */
interface NavigationLike {
  currentEntry: { index: number } | null;
}
const navigationApi = () => (window as unknown as { navigation?: NavigationLike }).navigation;
const entryIndex = () => navigationApi()?.currentEntry?.index;

/**
 * How long a confirmed Back may take before it is taken as impossible: on the
 * tab's first entry (page opened in a new tab or from a bookmark) there is
 * nothing to go back to (#920).
 */
const BACK_TIMEOUT_MS = 500;

/**
 * #759: while `active`, leaving the page asks first:
 * - a reload, a closed tab or a typed address: the browser's own question
 *   (`beforeunload`);
 * - a link of the app, which Next.js follows without unloading the page:
 *   `message`, and the link is not followed unless the person confirms;
 * - the code that leaves by `router.push` (menus, search, notifications,
 *   sign-out) asks through `leaveThen()` (lib/leaveGuard);
 * - Back (button, phone gesture): an extra history entry (same address) is
 *   kept on top while active, so Back first lands on it; then `message` is
 *   asked, and the page either stays (the entry is put back) or really goes
 *   back. Once nothing is left to lose, the extra entry is taken away again.
 * #920: a confirmed exit never leaves a step that does nothing (see
 * `stepOffThen`); a jump of several entries asks once and, declined, comes
 * back to the page (exactly with the Navigation API; without it, the page is
 * put back on top of the entry jumped to).
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

    // A link followed again once the extra entry is stepped off: already asked.
    let following = false;
    const onClick = (event: MouseEvent) => {
      if (following || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      const confirmed = confirmLeave();
      if (confirmed && !onLeaveEntry()) return;
      // Before Next.js's own handler on the app root, so the route does not change (yet).
      event.preventDefault();
      event.stopPropagation();
      if (confirmed) {
        stepOffThen(() => {
          following = true;
          try { link.click(); } finally { following = false; }
        });
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
    installStaleEntryStep();
    const pageHref = window.location.href;
    if (!onLeaveEntry()) pushLeaveEntry();
    let leaveEntryIndex = entryIndex();
    const putEntryBack = (url?: string) => {
      pushLeaveEntry(url);
      leaveEntryIndex = entryIndex();
    };
    leavingRef.current = false;
    // The history step that brings a declined jump back to the page.
    let returning = false;
    let landed = false;
    let backTimer: number | undefined;

    const onPopState = (event: PopStateEvent) => {
      if (returning) {
        returning = false;
        event.stopImmediatePropagation();
        return;
      }
      if (leavingRef.current) {
        landed = true;
        return;
      }
      if (isSteppingOff()) return;
      const index = entryIndex();
      // How many entries back the step went. Without the Navigation API, an
      // entry of the same address is taken as the page's own.
      const steps = index !== undefined && leaveEntryIndex !== undefined
        ? leaveEntryIndex - index
        : window.location.href === pageHref ? 1 : Number.NaN;

      if (steps === 1) {
        // The page's own entry, same address: Next.js's router, which may see
        // it too (in Chromium, window listeners run in the order they were
        // added), restores the same page.
        if (!confirmLeave()) {
          putEntryBack();
          return;
        }
        leavingRef.current = true;
        landed = false;
        window.history.back();
        // Nowhere to go back to (the tab's first entry): the page stays, and still asks.
        backTimer = window.setTimeout(() => {
          if (landed) return;
          leavingRef.current = false;
          putEntryBack();
        }, BACK_TIMEOUT_MS);
        return;
      }

      // A jump of several entries (long-press Back list, history.go(-2)):
      // confirmed, the jump is where the person goes, with no step more.
      if (confirmLeave()) {
        leavingRef.current = true;
        return;
      }
      // Declined: the page stays, the router must not follow the jump.
      event.stopImmediatePropagation();
      if (Number.isNaN(steps)) {
        putEntryBack(pageHref);
      } else {
        returning = true;
        window.history.go(steps);
      }
    };
    const onPageHide = () => { landed = true; };
    window.addEventListener('popstate', onPopState, true);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearTimeout(backTimer);
      window.removeEventListener('popstate', onPopState, true);
      window.removeEventListener('pagehide', onPageHide);
      // Nothing left to lose (saved, or the edit undone) while still on the
      // page: take the extra entry away, so the next Back really goes back.
      // Left by navigation, the current entry is the new page's: nothing to do.
      if (!leavingRef.current && onLeaveEntry()) {
        window.addEventListener('popstate', (event) => event.stopImmediatePropagation(), { capture: true, once: true });
        window.history.back();
      }
    };
  }, [active]);
}
