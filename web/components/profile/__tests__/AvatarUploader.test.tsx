import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PublicUser } from '@/hooks/useAuth';

// #769 — the pencil beside the name edited the sign-in username without a
// word; it is now changed from the security card, with the password.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useAuth', () => {
  const m = () => ({ mutate: vi.fn(), isPending: false });
  return { useUploadAvatar: m, useDeleteAvatar: m };
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
});
