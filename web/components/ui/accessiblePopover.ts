/**
 * #729: props for every HeroUI list or menu popover (Select, Autocomplete,
 * Dropdown, Popover), so screen readers can reach it inside a dialog.
 *
 * An open Modal or Drawer hides everything outside itself from assistive
 * technologies: react-aria's `ariaHideOutside` sets `aria-hidden` on the rest
 * of the page and on anything added to it later. The popovers are drawn in a
 * portal under <body>, so they are "outside". They should be spared through
 * `keepVisible`, but HeroUI's popovers call the copy in `@heroui/aria-utils`,
 * whose list of open dialogs is not the one the dialog registered in
 * (`@heroui/use-aria-modal-overlay` uses `@react-aria/overlays`). The call
 * does nothing, and the list a user opens in a form dialog (colour, cellar…)
 * or the line menu of the wine drawer is hidden as soon as it is drawn.
 *
 * react-aria leaves alone any element added with `data-react-aria-top-layer`
 * (the attribute its toasts use): the popover's outer element carries it.
 * Checked by components/ui/__tests__/overlayInDialog.test.tsx; every use is
 * checked by accessiblePopover.test.ts.
 */
export const ACCESSIBLE_POPOVER: Record<`data-${string}`, string> = { 'data-react-aria-top-layer': 'true' };
