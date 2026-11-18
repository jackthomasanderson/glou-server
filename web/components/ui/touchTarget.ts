/**
 * ux-ui.md §5.4: a touch target is at least 44 px. On a phone the hit area of a
 * small control grows with an invisible `::after` layer: nothing is resized or
 * moved, so no row gets wider or taller. Neighbours need a gap of the sum of
 * their overhangs, or their areas overlap.
 */

/** A 32 px icon button (HeroUI `size="sm"` `isIconOnly`) → 44 px (6 px each side; HeroUI buttons clip their overflow). */
export const PHONE_ICON_BUTTON = 'max-sm:overflow-visible max-sm:after:absolute max-sm:after:-inset-1.5 max-sm:after:content-[""]';

/** A 24 px bare icon button (`p-1` around 16 px): 10 px above and below. Sideways, `HIT_LEFT`/`HIT_RIGHT` pick the room each one has. */
const PHONE_PAD_Y = 'max-sm:relative max-sm:after:absolute max-sm:after:-inset-y-2.5 max-sm:after:content-[""]';
/** Last of a row, with the page's margin to its right (and 4 px to its neighbour on the left). */
export const PHONE_ICON_END = `${PHONE_PAD_Y} max-sm:after:-left-0.5 max-sm:after:-right-3.5`;
/** First of two neighbours, 4 px apart. */
export const PHONE_ICON_START = `${PHONE_PAD_Y} max-sm:after:-left-2.5 max-sm:after:-right-0.5`;
/** Alone in its row, with room on both sides. */
export const PHONE_ICON_ALONE = 'max-sm:relative max-sm:after:absolute max-sm:after:-inset-2.5 max-sm:after:content-[""]';
