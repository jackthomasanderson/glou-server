import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { Modal, ModalBody, ModalContent } from '@heroui/react';
import { TapTooltip } from '@/components/ui/TapTooltip';

// #976: like the lists and menus of #729 (overlayInDialog.test.tsx), a
// tooltip opened inside a dialog was drawn but hidden from screen readers
// (aria-hidden). The app's tooltips carry ACCESSIBLE_POPOVER; every one is
// checked by accessiblePopover.test.ts. vitest.setup.ts replaces HeroUI's
// Tooltip by its trigger: the real one is used here, without its animation
// (whose late import outlives the test file).
vi.mock('@heroui/react', async (importActual) => {
  const actual = await importActual<typeof import('@heroui/react')>();
  const { Tooltip } = await import('@heroui/tooltip');
  return { ...actual, Tooltip: (props: ComponentProps<typeof Tooltip>) => <Tooltip {...props} disableAnimation /> };
});

describe('a tooltip opened inside a dialog (#976)', () => {
  it('is exposed to assistive technology', async () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <ModalContent>
          <ModalBody>
            <TapTooltip content="Prix moyen payé" aria-label="Aide">?</TapTooltip>
          </ModalBody>
        </ModalContent>
      </Modal>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Aide' }));
    await waitFor(() => expect(document.querySelector('[role="tooltip"]')).not.toBeNull());
    // The dialog hides what is added outside it a moment later (a MutationObserver).
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Prix moyen payé');
  });
});
