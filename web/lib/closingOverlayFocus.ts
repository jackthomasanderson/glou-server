/**
 * #875: a closing Modal or Drawer lets go of the focus at once.
 *
 * HeroUI keeps a closed Modal/Drawer mounted while its exit animation runs
 * (0.3 s, longer on a busy page) but does not tell react-aria's `Overlay`
 * that it is exiting (no `isExiting`), so its `FocusScope` keeps containing
 * the focus until it unmounts: a page field focused in the meantime (the
 * search, a filter) had its focus pulled back into the closing window, and
 * its first keystrokes went there.
 *
 * Until HeroUI passes `isExiting`, this stops the focus events that would
 * trigger that pull-back, and only them: focus arriving outside a closing
 * window, and focus leaving it, while no other window is open. The
 * FocusScope listens on the document (bubble phase, added when a window
 * opens) and on the window's own root: this guard, installed once when the
 * app starts, runs before both. When nothing else takes the focus, the
 * FocusScope still gives it back to the control that opened the window.
 *
 * A closing window is the one #872 already lets clicks through
 * (globals.css): its dialog has lost `data-open`.
 *
 * What it can break: for those 0.3 s, a `focusin` listener on the document
 * in the bubble phase, added after the app started, does not hear focus
 * arriving on the page. Listen in the capture phase instead (the Undo
 * message does, lib/toast.ts). Focus going to a top layer (a message, a
 * list) is left alone: the FocusScope never pulls it back anyway.
 */

const CLOSING = '[aria-modal="true"]:not([data-open])';
const OPEN = '[aria-modal="true"][data-open]';

/** The overlay root of a closing window holding `node`, if any. */
function closingRootOf(doc: Document, node: EventTarget | null): Element | null {
  if (!(node instanceof Node)) return null;
  for (const dialog of doc.querySelectorAll(CLOSING)) {
    // The FocusScope wraps the overlay root around the dialog: its backdrop is outside the dialog.
    const root = dialog.closest('[tabindex="-1"]') ?? dialog;
    if (root.contains(node)) return root;
  }
  return null;
}

/** A message or a list: react-aria's focus trap lets the focus go there. */
const inTopLayer = (node: EventTarget | null) => node instanceof Element && node.closest('[data-react-aria-top-layer]') !== null;

const onlyClosingWindows = (doc: Document) => doc.querySelector(CLOSING) !== null && doc.querySelector(OPEN) === null;

export function installClosingOverlayFocusGuard(doc: Document): () => void {
  // Focus arriving on the page: kept from the FocusScope's document listener (added later, so after this one).
  const onFocusIn = (e: FocusEvent) => {
    if (onlyClosingWindows(doc) && !closingRootOf(doc, e.target) && !inTopLayer(e.target)) e.stopImmediatePropagation();
  };
  // Focus leaving the closing window: kept from the listener on its root (captured on the way down).
  const onFocusOut = (e: FocusEvent) => {
    if (onlyClosingWindows(doc) && closingRootOf(doc, e.target) && !closingRootOf(doc, e.relatedTarget)) e.stopPropagation();
  };
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut, true);
  return () => {
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', onFocusOut, true);
  };
}
