import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Button, Drawer, DrawerBody, DrawerContent, DrawerHeader } from '@heroui/react';
import { installTransitionCancelGuard } from '@/lib/transitionCancelGuard';

// #1022: after many windows opened and closed, a drawer opened with Enter
// left the focus on the card. react-aria moves the focus into a window
// opened from the keyboard once no CSS transition runs; a child's cancelled
// transition, bubbling up, made it lose track of the card's own, and it
// waited for good.

const frames = (n = 5) => act(async () => {
  for (let i = 0; i < n; i += 1) await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
});

/** What the browser fires as a CSS transition runs, ends or is cancelled. */
function transition(type: 'transitionrun' | 'transitionend' | 'transitioncancel', target: Element, propertyName: string) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  target.dispatchEvent(event);
}

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div data-testid="card">
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        <button type="button">Trash</button>
      </div>
      <Drawer isOpen={open} onClose={() => setOpen(false)}>
        <DrawerContent>
          <DrawerHeader>Wine</DrawerHeader>
          <DrawerBody><Button onPress={() => setOpen(false)}>Done</Button></DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}

let uninstall: () => void = () => {};
beforeEach(() => { uninstall = installTransitionCancelGuard(document); });
afterEach(() => uninstall());

describe('a drawer opened from the keyboard takes the focus (#1022)', () => {
  it('after a child\'s transition was cancelled during its card\'s own', async () => {
    render(<Page />);
    const card = screen.getByTestId('card');
    const trash = screen.getByRole('button', { name: 'Trash' });
    // The card's hover shadow changes; the trash button inside is pressed and released.
    transition('transitionrun', card, 'box-shadow');
    transition('transitionrun', trash, 'scale');
    transition('transitioncancel', trash, 'scale');
    // The pointer leaves: the card's shadow change is cancelled too.
    transition('transitioncancel', card, 'box-shadow');

    const open = screen.getByRole('button', { name: 'Open' });
    open.focus();
    // Enter on a button: a click with no pointer (detail 0), a "virtual" one for react-aria.
    fireEvent.click(open, { detail: 0 });
    await frames();
    const drawer = await screen.findByRole('dialog');
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
  });

  it('every time, however many windows were opened before', async () => {
    render(<Page />);
    const card = screen.getByTestId('card');
    const trash = screen.getByRole('button', { name: 'Trash' });
    for (let round = 0; round < 5; round += 1) {
      transition('transitionrun', card, 'box-shadow');
      transition('transitionrun', trash, 'scale');
      transition('transitioncancel', trash, 'scale');
      transition('transitioncancel', card, 'box-shadow');
      const open = screen.getByRole('button', { name: 'Open' });
      open.focus();
      fireEvent.click(open, { detail: 0 });
      await frames();
      const drawer = await screen.findByRole('dialog');
      await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
  });

  it('a cancelled transition reaches its own element\'s listeners, not its parents\'', () => {
    render(<Page />);
    const card = screen.getByTestId('card');
    const trash = screen.getByRole('button', { name: 'Trash' });
    const heard: string[] = [];
    trash.addEventListener('transitioncancel', () => heard.push('trash'));
    card.addEventListener('transitioncancel', () => heard.push('card'));
    transition('transitioncancel', trash, 'scale');
    transition('transitioncancel', card, 'box-shadow');
    expect(heard).toEqual(['trash', 'card']);
  });
});
