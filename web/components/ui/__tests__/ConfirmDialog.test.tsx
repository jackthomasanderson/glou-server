import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));

import { ConfirmDialog } from '../ConfirmDialog';

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete it?"
      message="This cannot be undone."
      confirmLabel="Delete"
      {...props}
    />,
  );
  return { onClose, onConfirm };
}

describe('ConfirmDialog (#630)', () => {
  it('shows the title, the question and both buttons, Cancel first', () => {
    setup();
    expect(screen.getByText('Delete it?')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    const buttons = screen.getAllByRole('button').filter((b) => /actions\.cancel|Delete/.test(b.textContent ?? ''));
    expect(buttons.map((b) => b.textContent)).toEqual(['actions.cancel', 'Delete']);
  });

  it('calls onConfirm and onClose from their buttons', () => {
    const { onClose, onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cannot be confirmed (or cancelled) twice while the request is pending', () => {
    const { onClose, onConfirm } = setup({ isPending: true });
    const confirm = screen.getByRole('button', { name: /Delete/ });
    const cancel = screen.getByRole('button', { name: 'actions.cancel' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(cancel.hasAttribute('disabled')).toBe(true);
    fireEvent.click(confirm);
    fireEvent.click(cancel);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on Escape while the request is pending', () => {
    const { onClose } = setup({ isPending: true });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape otherwise', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps confirm disabled when the caller says so, and renders extra content', () => {
    setup({ isConfirmDisabled: true, children: <p>Two tastings go too.</p> });
    expect(screen.getByRole('button', { name: 'Delete' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Two tastings go too.')).toBeTruthy();
  });
});
