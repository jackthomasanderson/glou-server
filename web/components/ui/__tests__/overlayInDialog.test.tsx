import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  Autocomplete, AutocompleteItem, Button, Drawer, DrawerBody, DrawerContent,
  Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Modal, ModalBody, ModalContent, SelectItem,
} from '@heroui/react';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { ACCESSIBLE_POPOVER } from '@/components/ui/accessiblePopover';

// #729: a dialog hides everything outside itself from assistive technologies
// (react-aria's ariaHideOutside). HeroUI's popovers ask to be kept visible
// through HeroUI's own copy of that helper, which the dialog does not use, so
// an open list or menu inside a dialog was drawn but marked aria-hidden.
// Testing Library's *ByRole queries skip aria-hidden content, like a screen
// reader. The dialog hides the list a moment after it is drawn (a
// MutationObserver), so each check waits for the list to be in the page and
// for that moment to pass before querying by role.

/** Waits for `selector` to be in the page, then lets pending DOM observers run. */
async function opened(selector: string) {
  await waitFor(() => expect(document.querySelector(selector)).not.toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('lists and menus opened inside a dialog (#729)', () => {
  it('exposes the options of a select in a form dialog', async () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <ModalContent>
          <ModalBody>
            <SingleSelect label="Couleur" defaultSelectedKeys={['red']}>
              <SelectItem key="red">Rouge</SelectItem>
              <SelectItem key="white">Blanc</SelectItem>
            </SingleSelect>
          </ModalBody>
        </ModalContent>
      </Modal>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Couleur/ }));
    await opened('[role="listbox"]');
    expect(screen.getByRole('option', { name: 'Blanc' })).toBeInTheDocument();
  });

  it('exposes the options of an autocomplete in a form dialog', async () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <ModalContent>
          <ModalBody>
            <Autocomplete label="Collection">
              <AutocompleteItem key="a">Grands crus</AutocompleteItem>
            </Autocomplete>
          </ModalBody>
        </ModalContent>
      </Modal>,
    );
    const input = await screen.findByRole('combobox', { name: 'Collection' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await opened('[role="listbox"]');
    expect(screen.getByRole('option', { name: 'Grands crus' })).toBeInTheDocument();
  });

  it('exposes the items of a line menu in a drawer', async () => {
    render(
      <Drawer isOpen onClose={() => {}}>
        <DrawerContent>
          <DrawerBody>
            <Dropdown {...ACCESSIBLE_POPOVER}>
              <DropdownTrigger><Button>Actions</Button></DropdownTrigger>
              <DropdownMenu aria-label="Actions">
                <DropdownItem key="edit">Modifier</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </DrawerBody>
        </DrawerContent>
      </Drawer>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Actions' }));
    await opened('[role="menu"]');
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toBeInTheDocument();
  });
});
