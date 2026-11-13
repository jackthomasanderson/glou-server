import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #887 (comment): the temporary password of an admin reset was copied with
// `navigator.clipboard`, missing over plain HTTP: Copy failed without a word.
// It goes through lib/clipboard (with its fallback) and says when it fails.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const copyText = vi.fn();
vi.mock('@/lib/clipboard', () => ({ copyText: (v: string) => copyText(v) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen: boolean; children?: ReactNode }) => (isOpen ? <div role="dialog">{children}</div> : null),
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, 'aria-label': label }: { children?: ReactNode; onPress?: () => void; 'aria-label'?: string }) => (
    <button type="button" aria-label={label} onClick={onPress}>{children}</button>
  ),
  ModalContent: ({ children }: { children: ReactNode | ((close: () => void) => ReactNode) }) => <>{typeof children === 'function' ? children(() => {}) : children}</>,
  ModalHeader: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { TempPasswordDialog } from '../TempPasswordDialog';

const result = { username: 'alex', tempPassword: 'Tmp-1234' };

describe('TempPasswordDialog (#887)', () => {
  beforeEach(() => copyText.mockReset());

  it('copies the password through the shared helper', async () => {
    copyText.mockResolvedValue(true);
    render(<TempPasswordDialog result={result} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.copy' }));
    expect(copyText).toHaveBeenCalledWith('Tmp-1234');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says when the copy failed, so the admin copies it by hand', async () => {
    copyText.mockResolvedValue(false);
    render(<TempPasswordDialog result={result} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('admin.users.resetPasswordCopyFailed');
  });
});
