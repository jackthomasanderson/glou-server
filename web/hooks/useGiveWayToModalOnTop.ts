'use client';
import { useCallback, useState, useSyncExternalStore } from 'react';

/** Every HeroUI modal and drawer carries it on its dialog while it is open. */
const MODAL_SELECTOR = '[aria-modal="true"]';

/** Where my own modal stands among the ones open right now. */
type Layer =
  /** Nothing else is open: the room is free. */
  | 'alone'
  /** Mine is open, another one has opened over it. */
  | 'covered'
  /** Mine is open, and last: it is the usable one. */
  | 'on-top'
  /** Mine is not in the page (not shown yet, or it gave way). */
  | 'absent';

/**
 * Two HeroUI modals open at once share one z-index (`z-50`) and one
 * full-screen container each, so paint order is document order: the one that
 * portalled into the body last covers the other whole and swallows every
 * click meant for it. The last one mounted also becomes the active focus
 * scope (`@react-aria/focus`), which keeps the focus and takes Escape. So
 * being last is being usable, and being first is being inert.
 */
function layerOf(selfSelector: string): Layer {
  const modals = Array.from(document.querySelectorAll(MODAL_SELECTOR));
  const mine = modals.find((el) => el.matches(selfSelector));
  const others = modals.filter((el) => el !== mine);
  if (others.length === 0) return 'alone';
  if (!mine) return 'absent';
  return others.some((el) => mine.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    ? 'covered'
    : 'on-top';
}

// A modal is added to and removed from the body (its exit animation included,
// so a window waiting its turn waits for the room to be really free).
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { subtree: true, childList: true, attributeFilter: ['aria-modal'] });
  return () => observer.disconnect();
}

const ignore = () => () => {};
const alone = (): Layer => 'alone';

/**
 * #1059: must my modal give way, because another one has opened over it?
 *
 * A window that may appear on its own — the sync conflict dialog, raised by
 * the replay of a queued change — is usable as long as it is the last one
 * opened, over the drawer or the page it lands on. But another window opened
 * afterwards (the tasting form, from the drink's « Noter une dégustation »)
 * covers it: its buttons then receive nothing and the only way out is
 * Escape, which goes to the form and loses what was being typed. So it steps
 * aside instead, and comes back once every other window is closed — its
 * question still has to be answered, and nothing the member typed is lost.
 *
 * `selfSelector` matches my own dialog (it carries `aria-modal` too while it
 * is open). `enabled` keeps the observer out of the way for as long as
 * nothing has to be shown: it would otherwise run on every DOM change.
 */
export function useGiveWayToModalOnTop(selfSelector: string, enabled = true): boolean {
  const read = useCallback(() => layerOf(selfSelector), [selfSelector]);
  // Read from the DOM, like useIsMobile reads matchMedia: no setState in an
  // effect, and the server's answer is "nothing else is open".
  const layer = useSyncExternalStore(enabled ? subscribe : ignore, enabled ? read : alone, alone);

  // 'absent' decides nothing: before being shown, mine is about to be the
  // last one opened — which is the usable one, over a drawer or a page, as
  // it has always been; and once it has given way, it waits for the room to
  // be free rather than coming back under the same window. Adjusted during
  // render, React's documented pattern.
  const [givenWay, setGivenWay] = useState(false);
  if (layer === 'covered' && !givenWay) setGivenWay(true);
  else if (layer === 'alone' && givenWay) setGivenWay(false);

  return givenWay;
}
