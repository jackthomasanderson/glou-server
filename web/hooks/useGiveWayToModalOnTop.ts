'use client';
import { useState, useSyncExternalStore } from 'react';

/** Every HeroUI modal and drawer carries it on its dialog while it is open, as do the app's own full-screen layers. */
const MODAL_SELECTOR = '[aria-modal="true"]';

/**
 * The windows open right now, as a version that only changes when that list
 * does — the store {@link useGiveWayToModalOnTop} listens to. A count would
 * not do: a window closing while another one opens leaves it unchanged, and
 * `useSyncExternalStore` would then never re-render to look again.
 */
let version = 0;
let known: Element[] = [];

function sync() {
  const open = Array.from(document.querySelectorAll(MODAL_SELECTOR));
  if (open.length !== known.length || open.some((el, i) => el !== known[i])) {
    known = open;
    version += 1;
  }
}

// A window is added to and removed from the page (its exit animation
// included, so one waiting its turn waits for the room to be really free).
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(() => {
    sync();
    onChange();
  });
  observer.observe(document.body, { subtree: true, childList: true, attributeFilter: ['aria-modal'] });
  sync();
  return () => observer.disconnect();
}

const ignore = () => () => {};
const read = () => version;
const none = () => 0;

/**
 * The window that has opened over mine, if any.
 *
 * Two HeroUI modals open at once share one z-index (`z-50`) and one
 * full-screen container each, so paint order is document order: the one that
 * portalled into the body last covers the other whole and swallows every
 * click meant for it. The last one mounted also becomes the active focus
 * scope (`@react-aria/focus`), which keeps the focus and takes Escape. So
 * being last is being usable, and being first is being inert.
 *
 * Nothing of mine in the page (not shown yet) decides nothing: mine is about
 * to be the last one opened, which is the usable one.
 */
function modalOver(selfSelector: string): Element | null {
  const open = Array.from(document.querySelectorAll(MODAL_SELECTOR));
  const mine = open.find((el) => el.matches(selfSelector));
  if (!mine) return null;
  return open.find((el) => el !== mine && (mine.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? null;
}

/**
 * #1059: must my modal give way, because another one has opened over it?
 *
 * A window that may appear on its own — the sync conflict dialog, raised by
 * the replay of a queued change — is usable as long as it is the last one
 * opened, over the drawer or the page it lands on. But another window opened
 * afterwards (the tasting form, from the drink's « Noter une dégustation »)
 * covers it: its buttons then receive nothing and the only way out is
 * Escape, which goes to the form and loses what was being typed. So it steps
 * aside instead, and comes back as soon as **that** window is gone — not
 * once every window is closed: the form is very often opened from a wine's
 * drawer, which stays open behind it (FamilyDrawer), and the question still
 * has to be answered. Nothing the member typed is lost either way.
 *
 * `selfSelector` matches my own dialog (it carries `aria-modal` too while it
 * is open). `enabled` keeps the observer out of the way for as long as
 * nothing has to be shown: it would otherwise run on every DOM change.
 */
export function useGiveWayToModalOnTop(selfSelector: string, enabled = true): boolean {
  const live = enabled && typeof document !== 'undefined';
  // Read from the page, like useIsMobile reads matchMedia: no setState in an
  // effect, and the server's answer is "nothing else is open".
  useSyncExternalStore(live ? subscribe : ignore, live ? read : none, none);

  // The window given way to, kept so its own closing brings mine back
  // whatever else is still open behind it. Adjusted during render, React's
  // documented pattern.
  const [coverer, setCoverer] = useState<Element | null>(null);
  if (!live) {
    if (coverer) setCoverer(null);
    return false;
  }
  if (coverer) {
    if (!document.body.contains(coverer)) setCoverer(null);
  } else {
    const over = modalOver(selfSelector);
    if (over) setCoverer(over);
  }

  return coverer !== null;
}
