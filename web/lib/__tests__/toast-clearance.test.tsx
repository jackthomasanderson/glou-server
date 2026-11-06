import { describe, it, expect, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { TOAST_OFFSET_PX, TOAST_WIDTH_PX, toastClearanceRef, toastLayout, useToastLayout } from '@/lib/toastClearance';

// Recette n°5 of #847: the « Annuler » message lay over the drawer's « Case
// C2·R3 » banner and its « Retirer de la case » button; a click on
// « Annuler » as it went removed the bottle from its cell.

describe('toastLayout', () => {
  it('no drawer: top-right, below where a drawer\'s close button sits (recette v3 of #471)', () => {
    expect(toastLayout(1280, null)).toEqual({ placement: 'top-right', offset: TOAST_OFFSET_PX, insetRight: 0 });
  });

  // Recette n°5 bis of #847: top-left, the message lay over the page's back
  // arrow and the side menu's « Vins » — a late click left the page.
  it('a drawer on a wide screen: at the bottom, against the drawer — neither the drawer, the side menu nor the header covered', () => {
    const layout = toastLayout(1366, { width: 440, headerBottom: 150 }, 240);
    expect(layout).toEqual({ placement: 'bottom-right', offset: 16, insetRight: 448 });
    // The message (356 px) fits between the side menu and the drawer.
    expect(1366 - layout.insetRight - TOAST_WIDTH_PX).toBeGreaterThanOrEqual(240);
  });

  it('a drawer as wide as the screen: below its header, its cell and « Retirer de la case »', () => {
    expect(toastLayout(390, { width: 390, headerBottom: 150 })).toEqual({ placement: 'top-right', offset: 158, insetRight: 0 });
    // Without room enough beside it either (a narrow window).
    expect(toastLayout(760, { width: 440, headerBottom: 120 })).toEqual({ placement: 'top-right', offset: 128, insetRight: 0 });
    // Room beside the drawer, but taken by the side menu.
    expect(toastLayout(1000, { width: 440, headerBottom: 120 }, 240)).toEqual({ placement: 'top-right', offset: 128, insetRight: 0 });
  });
});

function Probe() {
  const layout = useToastLayout();
  return <output data-testid="layout">{`${layout.placement} ${layout.offset} ${layout.insetRight}`}</output>;
}

describe('toastClearanceRef', () => {
  afterEach(() => { act(() => toastClearanceRef(null)); });

  it('moves the messages while a drawer\'s header is shown, and back once it goes', () => {
    render(<Probe />);
    expect(screen.getByTestId('layout')).toHaveTextContent(`top-right ${TOAST_OFFSET_PX} 0`);
    const header = document.createElement('div');
    Object.defineProperty(header, 'offsetWidth', { value: window.innerWidth });
    header.getBoundingClientRect = () => ({ bottom: 140 } as DOMRect);
    act(() => toastClearanceRef(header));
    expect(screen.getByTestId('layout')).toHaveTextContent('top-right 148 0');
    act(() => toastClearanceRef(null));
    expect(screen.getByTestId('layout')).toHaveTextContent(`top-right ${TOAST_OFFSET_PX} 0`);
  });

  it('beside a drawer on a wide screen, keeps clear of the side menu measured on the page', () => {
    render(<><main id="main-content" /><Probe /></>);
    const main = document.getElementById('main-content')!;
    main.getBoundingClientRect = () => ({ left: window.innerWidth - 440 - 300 } as DOMRect);
    const header = document.createElement('div');
    Object.defineProperty(header, 'offsetWidth', { value: 440 });
    header.getBoundingClientRect = () => ({ bottom: 140 } as DOMRect);
    act(() => toastClearanceRef(header));
    // 300 px free beside the drawer: too little for a message.
    expect(screen.getByTestId('layout')).toHaveTextContent('top-right 148 0');
  });
});
