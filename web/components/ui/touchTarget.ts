/**
 * ux-ui.md §5.4: a touch target is at least 44 px. On a phone these grow a
 * control's hit area without moving it or making its row taller: the negative
 * margin gives back the space the larger box takes.
 */

/** A 32 px icon button (HeroUI `size="sm"` `isIconOnly`) → 44 px. */
export const PHONE_ICON_BUTTON = 'max-sm:h-11 max-sm:w-11 max-sm:min-w-11 max-sm:-m-1.5';

/** A bare icon button padded with `p-1` around a 16 px icon (24 px) → 44 px. */
export const PHONE_PADDED_ICON = 'max-sm:p-3.5 max-sm:-my-2.5';
