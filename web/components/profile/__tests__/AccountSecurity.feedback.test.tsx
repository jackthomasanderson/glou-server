import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PublicUser } from '@/hooks/useAuth';

// #768: every save of the profile page confirms with the same success toast,
// never a banner inside one card.

const notifySuccess = vi.fn();
vi.mock('@/lib/toast', () => ({ notifySuccess: (...args: unknown[]) => notifySuccess(...args), notifyError: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useAuth', () => {
  const m = () => ({ mutate: vi.fn(), isPending: false });
  const succeeds = () => ({ mutate: (_: unknown, o?: { onSuccess?: () => void }) => o?.onSuccess?.(), isPending: false });
  return { useUpdateEmail: m, useUpdateUsername: m, useUpdatePassword: m, useUpdatePreferences: succeeds, useSetPin: m, useRemovePin: m };
});
vi.mock('@/components/profile/TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));
vi.mock('@/components/profile/TrustedDeviceSettings', () => ({ TrustedDeviceSettings: () => null }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: () => null }));
vi.mock('@/components/auth/PasswordStrengthMeter', () => ({ PasswordStrengthMeter: () => null }));
vi.mock('@/components/ui/SingleSelect', () => ({
  SingleSelect: ({ 'aria-label': label, onSelectionChange }: { 'aria-label'?: string; onSelectionChange: (keys: Set<string>) => void }) => (
    <button type="button" onClick={() => onSelectionChange(new Set(['15']))}>{label}</button>
  ),
}));

import { AccountSecurity } from '../AccountSecurity';

const user = { id: 'u1', username: 'alex84', email: 'a@example.com', hasPin: false, autoLockDelayMin: null } as unknown as PublicUser;

describe('AccountSecurity save feedback (#768)', () => {
  beforeEach(() => notifySuccess.mockReset());

  it('confirms an auto-lock change with the success toast, without a banner in the card', () => {
    const { container } = render(<AccountSecurity user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'profile.autoLockDelay' }));
    expect(notifySuccess).toHaveBeenCalledWith('profile.saveSuccess');
    expect(screen.queryByText('profile.saveSuccess')).toBeNull();
    expect(container.querySelector('.bg-success-50')).toBeNull();
  });
});
