import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Button, Drawer, DrawerBody, DrawerContent, Modal, ModalBody, ModalContent } from '@heroui/react';
import { installClosingOverlayFocusGuard } from '@/lib/closingOverlayFocus';

// #875: while a Modal or Drawer plays its closing animation, its focus trap
// stayed on (HeroUI does not tell react-aria's Overlay it is exiting): a
// page field focused then had its focus pulled back into the closing window.

const frames = (n = 5) => act(async () => {
  for (let i = 0; i < n; i += 1) await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
});

function Page({ kind, initiallyOpen = true }: { kind: 'modal' | 'drawer'; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const content = (
    <>
      <input aria-label="Inside" autoFocus />
      <Button onPress={() => setOpen(false)}>Done</Button>
    </>
  );
  return (
    <>
      <input aria-label="Search" />
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {kind === 'modal' ? (
        <Modal isOpen={open} onClose={() => setOpen(false)}><ModalContent><ModalBody>{content}</ModalBody></ModalContent></Modal>
      ) : (
        <Drawer isOpen={open} onClose={() => setOpen(false)}><DrawerContent><DrawerBody>{content}</DrawerBody></DrawerContent></Drawer>
      )}
    </>
  );
}

let uninstall: () => void = () => {};
beforeEach(() => { uninstall = installClosingOverlayFocusGuard(document); });
afterEach(() => uninstall());

describe('focus right after closing a window (#875)', () => {
  it.each(['modal', 'drawer'] as const)('stays on the page field focused during the %s exit animation', async (kind) => {
    render(<Page kind={kind} />);
    await frames();
    const inside = screen.getByRole('textbox', { name: 'Inside' });
    act(() => inside.focus());
    expect(document.activeElement).toBe(inside);
    act(() => screen.getByRole('button', { name: 'Done' }).click());
    // The window is still there, closing.
    expect(document.querySelector('[aria-modal="true"]:not([data-open])')).not.toBeNull();
    const search = document.querySelector<HTMLInputElement>('input[aria-label="Search"]')!;
    act(() => search.focus());
    await frames();
    expect(document.activeElement).toBe(search);
  });

  it.each(['modal', 'drawer'] as const)('still gives the focus back to the opening control when nothing else took it (%s)', async (kind) => {
    render(<Page kind={kind} initiallyOpen={false} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    act(() => opener.focus());
    act(() => opener.click());
    await frames();
    act(() => screen.getByRole('button', { name: 'Done' }).click());
    await waitFor(() => expect(document.querySelector('[aria-modal="true"]')).toBeNull(), { timeout: 3000 });
    await frames();
    expect(document.activeElement).toBe(opener);
  });

  // Review of #1018: focus going to a message or a list (a top layer) is
  // never pulled back by the trap, so the guard leaves its event alone.
  it('lets focus arriving on a top layer reach the other listeners while a window closes', async () => {
    render(<Page kind="modal" />);
    await frames();
    act(() => screen.getByRole('textbox', { name: 'Inside' }).focus());
    act(() => screen.getByRole('button', { name: 'Done' }).click());
    expect(document.querySelector('[aria-modal="true"]:not([data-open])')).not.toBeNull();
    const layer = document.createElement('div');
    layer.setAttribute('data-react-aria-top-layer', 'true');
    const undo = document.createElement('button');
    layer.appendChild(undo);
    document.body.appendChild(layer);
    const heard: EventTarget[] = [];
    const listener = (e: FocusEvent) => { if (e.target) heard.push(e.target); };
    document.addEventListener('focusin', listener);
    try {
      act(() => undo.focus());
      expect(heard).toContain(undo);
    } finally {
      document.removeEventListener('focusin', listener);
      layer.remove();
    }
  });
});

