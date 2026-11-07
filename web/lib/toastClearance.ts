'use client';
import { useSyncExternalStore } from 'react';

/**
 * Messages start this far below the top edge: at the top, a message covered
 * the close button of a drawer, so pressing the cross closed the message
 * instead of the drawer (recette v3 of #471). Still top-right (ux-ui.md 9.4).
 */
export const TOAST_OFFSET_PX = 64;

/** HeroUI's width of a message on a wide screen (`sm:w-[356px]`). */
export const TOAST_WIDTH_PX = 356;
/** Kept free on each side of a message set beside a drawer, and under a drawer's header. */
const GAP_PX = 16;

export interface ToastLayout {
  placement: 'top-right' | 'bottom-right';
  /** From the top (top-right) or the bottom (bottom-right) edge. */
  offset: number;
  /** Kept free on the right of the messages: the drawer beside them, 0 without one. */
  insetRight: number;
}

/** What a drawer's header tells: the drawer's width, and where its header ends. */
export interface DrawerBox {
  width: number;
  headerBottom: number;
}

const DEFAULT: ToastLayout = { placement: 'top-right', offset: TOAST_OFFSET_PX, insetRight: 0 };

/**
 * Where messages go, so that they cover neither a drawer's actions nor the
 * navigation. Recette n°5 of #847: the « Annuler » message lay exactly over
 * the drawer's « Case C2·R3 » banner and its « Retirer de la case » button.
 * Recette n°5 bis: set top-left instead, it lay over the page's back arrow
 * and the side menu — a late click left the page.
 * - No drawer: top-right, below a drawer's close button (recette v3 of #471).
 * - A drawer leaving room beside it, right of the side menu (`contentLeft`,
 *   a wide screen): bottom-right of that free room, against the drawer —
 *   nothing of the drawer, the side menu or the page's header covered.
 * - Otherwise (a phone, a narrow window): below the drawer's header — the
 *   name, the close button, the cell and « Retirer de la case ».
 */
export function toastLayout(viewportWidth: number, drawer: DrawerBox | null, contentLeft = 0): ToastLayout {
  if (!drawer) return DEFAULT;
  if (viewportWidth - drawer.width - contentLeft >= TOAST_WIDTH_PX + 2 * GAP_PX) {
    return { placement: 'bottom-right', offset: GAP_PX, insetRight: drawer.width + GAP_PX / 2 };
  }
  return { placement: 'top-right', offset: Math.max(TOAST_OFFSET_PX, Math.round(drawer.headerBottom + GAP_PX / 2)), insetRight: 0 };
}

// The header of the drawer open, if any: one drawer at a time.
let header: HTMLElement | null = null;
let observer: ResizeObserver | null = null;
const listeners = new Set<() => void>();
const keyOf = (layout: ToastLayout) => `${layout.placement}|${layout.offset}|${layout.insetRight}`;
let snapshot = keyOf(DEFAULT);

function measure(): ToastLayout {
  if (!header || typeof window === 'undefined') return DEFAULT;
  // The page's content starts right of the side menu (MainLayout's <main>; 0 without a side menu).
  const content = document.getElementById('main-content');
  const contentLeft = content ? Math.max(0, content.getBoundingClientRect().left) : 0;
  // offsetWidth ignores the drawer's slide-in transform; the header spans the drawer.
  return toastLayout(window.innerWidth, { width: header.offsetWidth, headerBottom: header.getBoundingClientRect().bottom }, contentLeft);
}

function update() {
  const next = keyOf(measure());
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/**
 * The ref of a drawer's header: while it is shown, messages keep clear of
 * the drawer ({@link toastLayout}). Follows the header's size (a cell banner
 * shown, a name on two lines) and the window's.
 */
export function toastClearanceRef(element: HTMLElement | null) {
  if (element === header) return;
  observer?.disconnect();
  observer = null;
  if (typeof window !== 'undefined') window.removeEventListener('resize', update);
  header = element;
  if (element) {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(element);
    }
    window.addEventListener('resize', update);
  }
  update();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getServerSnapshot = () => keyOf(DEFAULT);

/** Where the app's messages go now ({@link toastLayout}): read by the ToastProvider. */
export function useToastLayout(): ToastLayout {
  const key = useSyncExternalStore(subscribe, () => snapshot, getServerSnapshot);
  const [placement, offset, insetRight] = key.split('|');
  return { placement: placement as ToastLayout['placement'], offset: Number(offset), insetRight: Number(insetRight) };
}
