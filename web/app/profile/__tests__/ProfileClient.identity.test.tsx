import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #769 — one way to set the name others see; the app name and slogan are
// display settings seen by the member only. #766 — the security section is
// one card (AccountSecurity holds two-factor) plus the sessions.

const updateProfile = vi.fn();
let hookCall = 0;
let pendingCalls: number[] = [];
// One object, like a query's cached data: the page seeds its form when it changes.
let mockUser = { id: 'u1', theme: 'SYSTEM', isAdmin: false, username: 'alex84', displayName: 'Alex', appName: 'Ma cave', appSlogan: 'Santé' };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: mockUser, isLoading: false }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
  // Called once per form: the n-th call of a render is pending when listed.
  useUpdateProfile: () => ({ mutate: updateProfile, isPending: pendingCalls.includes(hookCall++ % 2) }),
  useUpdatePreferences: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn() }));
vi.mock('@/components/ui/MainLayout', () => ({ MainLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ui/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/ui/SingleSelect', () => ({ SingleSelect: () => null }));
vi.mock('@/components/profile/TwoFactorSettings', () => ({ TwoFactorSettings: () => <div>two-factor-card</div> }));
vi.mock('@/components/profile/AccountSecurity', () => ({ AccountSecurity: () => <div>security-card</div> }));
vi.mock('@/components/profile/SessionsPanel', () => ({ SessionsPanel: () => <div>sessions-card</div> }));
vi.mock('@/components/profile/AvatarUploader', () => ({ AvatarUploader: () => null }));
vi.mock('@/components/profile/GdprSection', () => ({ GdprSection: () => null }));
vi.mock('@/components/shares/SharesDashboard', () => ({ SharesDashboard: () => null }));
vi.mock('@/components/profile/NotificationPreferences', () => ({ NotificationPreferences: () => null }));
vi.mock('@/components/profile/AppVersion', () => ({ AppVersion: () => null }));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, type, isLoading }: { children?: ReactNode; onPress?: () => void; type?: 'submit' | 'button'; isLoading?: boolean }) => (
    <button type={type ?? 'button'} onClick={onPress} data-loading={isLoading ? 'true' : undefined}>{children}</button>
  ),
  Input: ({ label, description, value, onValueChange }: {
    label?: string; description?: string; value?: string; onValueChange?: (v: string) => void;
  }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={(e) => onValueChange?.(e.target.value)} />
      {description && <span>{description}</span>}
    </label>
  ),
  SelectItem: () => null,
  Switch: () => null,
  CircularProgress: () => <div role="status" />,
}));

import { ProfileClient } from '../ProfileClient';

const section = (id: string) => document.getElementById(id) as HTMLElement;

describe('ProfileClient identity and display settings (#769)', () => {
  beforeEach(() => {
    updateProfile.mockReset();
    hookCall = 0;
    pendingCalls = [];
    mockUser = { ...mockUser, theme: 'SYSTEM', appName: 'Ma cave' };
  });

  it('text typed in one form survives a save of another setting (review)', () => {
    const { rerender } = render(<ProfileClient />);
    const prefs = within(section('preferences'));
    fireEvent.change(prefs.getByLabelText('profile.appName'), { target: { value: 'Cave du haut' } });
    // The theme auto-saved elsewhere: the member comes back as a new object.
    mockUser = { ...mockUser, theme: 'DARK' };
    rerender(<ProfileClient />);
    expect((within(section('preferences')).getByLabelText('profile.appName') as HTMLInputElement).value).toBe('Cave du haut');
  });

  it('each save button spins for its own form only (review)', () => {
    pendingCalls = [0];
    render(<ProfileClient />);
    expect(within(section('account')).getByRole('button', { name: 'actions.save' }).dataset.loading).toBe('true');
    expect(within(section('preferences')).getByRole('button', { name: 'profile.appDisplaySave' }).dataset.loading).toBeUndefined();
  });

  it('personal details hold one name field, said to be seen by the other members', () => {
    render(<ProfileClient />);
    const account = within(section('account'));
    expect(account.getByLabelText('auth.displayName')).toBeInTheDocument();
    expect(account.getByText('profile.displayNameHint')).toBeInTheDocument();
    expect(account.queryByLabelText('profile.appName')).toBeNull();
    expect(account.queryByLabelText('profile.appSlogan')).toBeNull();
  });

  it('saving personal details sends the display name only', () => {
    render(<ProfileClient />);
    fireEvent.submit(within(section('account')).getByRole('button', { name: 'actions.save' }).closest('form')!);
    expect(updateProfile).toHaveBeenCalledWith({ displayName: 'Alex' }, expect.anything());
  });

  it('the app name and slogan are display preferences, seen by the member only', () => {
    render(<ProfileClient />);
    const prefs = within(section('preferences'));
    expect(prefs.getByLabelText('profile.appName')).toBeInTheDocument();
    expect(prefs.getByLabelText('profile.appSlogan')).toBeInTheDocument();
    expect(prefs.getByText('profile.appDisplayHint')).toBeInTheDocument();
    fireEvent.change(prefs.getByLabelText('profile.appName'), { target: { value: 'Cave' } });
    fireEvent.submit(prefs.getByRole('button', { name: 'profile.appDisplaySave' }).closest('form')!);
    expect(updateProfile).toHaveBeenCalledWith({ appName: 'Cave', appSlogan: 'Santé' }, expect.anything());
  });

  it('the security section is one card plus the sessions, no separate two-factor card (#766)', () => {
    render(<ProfileClient />);
    const security = within(section('security'));
    expect(security.getByText('security-card')).toBeInTheDocument();
    expect(security.getByText('sessions-card')).toBeInTheDocument();
    expect(security.queryByText('two-factor-card')).toBeNull();
  });
});
