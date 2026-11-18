/**
 * #1022: a window opened from the keyboard sometimes left the focus behind.
 *
 * Opening a Modal or Drawer from the keyboard (Enter on a button fires a
 * click with no pointer, which react-aria counts as a "virtual" interaction,
 * like a screen reader's) does not move the focus at once: react-aria's
 * `focusSafely` waits until no CSS transition is running on the page
 * (`runAfterTransition`). It tracks them from `transitionrun` and
 * `transitionend` on the body, and from a one-time `transitioncancel`
 * listener on each transitioning element. But `transitioncancel` bubbles: a
 * child's cancelled transition (a button inside a card, released while the
 * card's hover shadow was still changing) used up the card's listener, and
 * the card's own cancel was never heard. The card then stayed "transitioning"
 * for good, and every later window opened from the keyboard never took the
 * focus: it stayed on the card, outside the open drawer.
 *
 * This stops a `transitioncancel` at its own element, so it no longer bubbles
 * to its parents' listeners. Capture-phase listeners still hear it, but React
 * delegates `onTransitionCancel` to its root container in the bubble phase:
 * with this guard, no `onTransitionCancel` prop ever fires (only
 * `onTransitionCancelCapture` does). Nothing in the app uses it. Installed
 * once when the app starts, in the capture phase.
 *
 * The cause is upstream, in react-aria's `runAfterTransition` (still there in
 * react-aria 3.53.1): remove this guard once it ignores a `transitioncancel`
 * whose target is not the element it was registered on.
 */

const stopAtTarget = (e: Event) => e.stopPropagation();

export function installTransitionCancelGuard(doc: Document): () => void {
  const onCancel = (e: Event) => {
    // Added before the event reaches its element, after that element's own listeners.
    e.target?.addEventListener('transitioncancel', stopAtTarget, { once: true });
  };
  doc.addEventListener('transitioncancel', onCancel, true);
  return () => doc.removeEventListener('transitioncancel', onCancel, true);
}
