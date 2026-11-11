import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TapTooltip } from '../TapTooltip';

// The global setup replaces HeroUI's Tooltip by its trigger (its animation
// chunk loads after jsdom is gone). This file needs the bubble, so it brings a
// stand-in that shows the content exactly when the component asks it to be
// open: what is under test is TapTooltip's own state, not react-aria's.
vi.mock('@heroui/react', () => ({
  Tooltip: ({ children, content, isOpen }: { children: ReactNode; content: ReactNode; isOpen?: boolean }) => (
    <>
      {children}
      {isOpen && <div role="tooltip">{content}</div>}
    </>
  ),
}));

// #656: HeroUI's Tooltip opens on hover and keyboard focus only; a tap on a
// phone never showed the "modified offline" explanation.

describe('TapTooltip', () => {
  it('opens on a tap (touch pointer) and shows the text', async () => {
    render(<TapTooltip content="Waiting for sync" aria-label="Waiting for sync">x</TapTooltip>);
    expect(screen.queryByRole('tooltip')).toBeNull();
    const button = screen.getByRole('button', { name: 'Waiting for sync' });
    fireEvent.pointerDown(button, { pointerType: 'touch', pointerId: 1 });
    fireEvent.pointerUp(button, { pointerType: 'touch', pointerId: 1 });
    fireEvent.click(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Waiting for sync');
  });

  it('closes when the button loses focus', async () => {
    render(<TapTooltip content="Waiting for sync">x</TapTooltip>);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(button);
    await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('never lets the press reach the card or row around it', () => {
    const onCard = vi.fn();
    render(<div onClick={onCard}><TapTooltip content="Waiting for sync">x</TapTooltip></div>);
    fireEvent.click(screen.getByRole('button'));
    expect(onCard).not.toHaveBeenCalled();
  });
});
