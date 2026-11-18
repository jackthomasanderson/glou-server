import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// A modal still on screen while it fades out: its content stays mounted after isOpen turns false.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ children }: { children?: ReactNode }) => <div role="dialog">{children}</div>,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  ModalContent: ({ children }: { children?: ReactNode | (() => ReactNode) }) => <>{typeof children === 'function' ? children() : children}</>,
  ModalHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
}));

import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog fade-out (#630)', () => {
  it('keeps the last title, message, details and button label once the caller clears them', () => {
    const base = { onClose: vi.fn(), onConfirm: vi.fn() };
    const { rerender } = render(
      <ConfirmDialog isOpen {...base} title="Delete Foo?" message="Foo goes" confirmLabel="Delete"><p>details</p></ConfirmDialog>,
    );
    rerender(<ConfirmDialog isOpen={false} {...base} title={undefined} message={undefined} confirmLabel={undefined} />);
    expect(screen.getByText('Delete Foo?')).toBeTruthy();
    expect(screen.getByText('Foo goes')).toBeTruthy();
    expect(screen.getByText('details')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });
});
