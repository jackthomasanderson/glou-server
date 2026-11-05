import { describe, it, expect, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { TOAST_OFFSET_PX, toastClearanceRef, toastLayout, useToastLayout } from '@/lib/toastClearance';

// Recette n°5 of #847: the « Annuler » message lay over the drawer's « Case
// C2·R3 » banner and its « Retirer de la case » button; a click on
// « Annuler » as it went removed the bottle from its cell.

describe('toastLayout', () => {
  it('no drawer: top-right, below where a drawer\'s close button sits (recette v3 of #471)', () => {
    expect(toastLayout(1280, null)).toEqual({ placement: 'top-right', offset: TOAST_OFFSET_PX });
  });

  it('a drawer on a wide screen: beside it, top-left — nothing of the drawer covered', () => {
    expect(toastLayout(1280, { width: 440, headerBottom: 150 })).toEqual({ placement: 'top-left', offset: TOAST_OFFSET_PX });
  });

  it('a drawer as wide as the screen: below its header, its cell and « Retirer de la case »', () => {
    expect(toastLayout(390, { width: 390, headerBottom: 150 })).toEqual({ placement: 'top-right', offset: 158 });
    // Without room enough beside it either (a narrow window).
    expect(toastLayout(760, { width: 440, headerBottom: 120 })).toEqual({ placement: 'top-right', offset: 128 });
  });
});

function Probe() {
  const layout = useToastLayout();
  return <output data-testid="layout">{`${layout.placement} ${layout.offset}`}</output>;
}

describe('toastClearanceRef', () => {
  afterEach(() => { act(() => toastClearanceRef(null)); });

  it('moves the messages while a drawer\'s header is shown, and back once it goes', () => {
    render(<Probe />);
    expect(screen.getByTestId('layout')).toHaveTextContent(`top-right ${TOAST_OFFSET_PX}`);
    const header = document.createElement('div');
    Object.defineProperty(header, 'offsetWidth', { value: window.innerWidth });
    header.getBoundingClientRect = () => ({ bottom: 140 } as DOMRect);
    act(() => toastClearanceRef(header));
    expect(screen.getByTestId('layout')).toHaveTextContent('top-right 148');
    act(() => toastClearanceRef(null));
    expect(screen.getByTestId('layout')).toHaveTextContent(`top-right ${TOAST_OFFSET_PX}`);
  });
});
