import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PublicUser } from '@/hooks/useAuth';

// #769 — the pencil beside the name edited the sign-in username without a
// word; it is now changed from the security card, with the password.

const notifySuccess = vi.fn();
vi.mock('@/lib/toast', () => ({ notifySuccess: (...args: unknown[]) => notifySuccess(...args), notifyError: vi.fn() }));
vi.mock('@/lib/image-resize', () => ({ downscaleImage: async (file: File) => file }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useAuth', () => {
  const m = () => ({ mutate: vi.fn(), isPending: false });
  // #768: an upload that succeeds at once.
  const succeeds = () => ({ mutate: (_: unknown, o?: { onSuccess?: () => void }) => o?.onSuccess?.(), isPending: false });
  return { useUploadAvatar: succeeds, useDeleteAvatar: m };
});
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: () => null }));
vi.mock('@heroui/react', () => ({
  Avatar: () => <span />,
  Button: ({ children, 'aria-label': label }: { children?: ReactNode; 'aria-label'?: string }) => <button type="button" aria-label={label}>{children}</button>,
  CircularProgress: () => null,
  ModalContent: () => null, ModalHeader: () => null, ModalBody: () => null, ModalFooter: () => null,
}));

import { AvatarUploader } from '../AvatarUploader';

describe('AvatarUploader (#769)', () => {
  it('shows the username but offers no way to edit it here', () => {
    render(<AvatarUploader user={{ id: 'u1', username: 'alex84', email: 'a@example.com', avatarUrl: null } as unknown as PublicUser} />);
    expect(screen.getByText('alex84')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'actions.edit' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('confirms a new photo with the success toast of the page, not a banner (#768)', async () => {
    const { container } = render(<AvatarUploader user={{ id: 'u1', username: 'alex84', email: 'a@example.com', avatarUrl: null } as unknown as PublicUser} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('profile.avatarSuccess'));
    expect(screen.queryByText('profile.avatarSuccess')).toBeNull();
  });
});
