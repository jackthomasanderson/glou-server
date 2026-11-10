import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import type { ReactNode } from 'react';

// #774 (sidebar duplicates), #779 (position cue), #839 (hash on load).

let mockUser: { id: string; isAdmin: boolean } | undefined;
let mockLoading = false;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: mockUser, isLoading: mockLoading }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePreferences: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn() }));
vi.mock('@/components/ui/MainLayout', () => ({ MainLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ui/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/ui/SingleSelect', () => ({ SingleSelect: () => null }));
vi.mock('@/components/profile/TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));
vi.mock('@/components/profile/AccountSecurity', () => ({ AccountSecurity: () => null }));
vi.mock('@/components/profile/SessionsPanel', () => ({ SessionsPanel: () => null }));
vi.mock('@/components/profile/AvatarUploader', () => ({ AvatarUploader: () => null }));
vi.mock('@/components/profile/GdprSection', () => ({ GdprSection: () => null }));
vi.mock('@/components/shares/SharesDashboard', () => ({ SharesDashboard: () => null }));
vi.mock('@/components/profile/NotificationPreferences', () => ({ NotificationPreferences: () => null }));
vi.mock('@/components/profile/AppVersion', () => ({ AppVersion: () => null }));
vi.mock('@heroui/react', () => ({
  Button: ({ children, color, variant, isLoading, onPress, startContent, fullWidth, as: _as, ...rest }: Record<string, unknown> & { children?: ReactNode }) => {
    void isLoading; void startContent; void fullWidth; void _as;
    return <button type="button" data-color={color as string} data-variant={variant as string} onClick={onPress as () => void} {...(rest.href ? { 'data-href': rest.href as string } : {})}>{children}</button>;
  },
  Input: () => null,
  SelectItem: () => null,
  Switch: () => null,
  CircularProgress: () => <div role="status" />,
}));

import { ProfileClient } from '../ProfileClient';

const SECTIONS = ['account', 'preferences', 'security', 'shares', 'notifications', 'data'];
const scrollIntoView = vi.fn();
let scrolledIds: string[] = [];

describe('ProfileClient', () => {
  beforeEach(() => {
    mockUser = { id: 'u1', isAdmin: true };
    mockLoading = false;
    scrolledIds = [];
    scrollIntoView.mockReset();
    scrollIntoView.mockImplementation(function (this: HTMLElement) { scrolledIds.push(this.id); });
    Element.prototype.scrollIntoView = scrollIntoView;
    window.location.hash = '';
  });
  afterEach(() => { window.location.hash = ''; });

  it('scrolls to the section named by the hash once the profile is rendered (#839)', () => {
    window.location.hash = '#shares';
    mockLoading = true;
    const { rerender } = render(<ProfileClient />);
    expect(scrolledIds).toEqual([]);
    mockLoading = false;
    rerender(<ProfileClient />);
    expect(scrolledIds).toEqual(['shares']);
  });

  it('scrolls when the hash is present on a first render that is already loaded (#839)', () => {
    window.location.hash = '#security';
    render(<ProfileClient />);
    expect(scrolledIds).toEqual(['security']);
  });

  it('does not scroll without a hash', () => {
    render(<ProfileClient />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('follows later hash changes (#839)', () => {
    render(<ProfileClient />);
    act(() => { window.location.hash = '#data'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(scrolledIds).toEqual(['data']);
  });

  it('shows six short shortcuts and marks the current one with aria-current (#779)', () => {
    window.location.hash = '#notifications';
    render(<ProfileClient />);
    const nav = screen.getByRole('navigation', { name: 'profile.sectionsNav' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(SECTIONS.map((id) => `profile.sectionLabels.${id}`));
    const current = links.filter((l) => l.getAttribute('aria-current') === 'true');
    expect(current.map((l) => l.getAttribute('href'))).toEqual(['#notifications']);
  });

  it('marks the first shortcut by default and the clicked one after a click (#779)', () => {
    render(<ProfileClient />);
    const nav = screen.getByRole('navigation', { name: 'profile.sectionsNav' });
    expect(within(nav).getByRole('link', { name: 'profile.sectionLabels.account' })).toHaveAttribute('aria-current', 'true');
    act(() => { within(nav).getByRole('link', { name: 'profile.sectionLabels.security' }).click(); });
    expect(within(nav).getByRole('link', { name: 'profile.sectionLabels.security' })).toHaveAttribute('aria-current', 'true');
    expect(within(nav).getByRole('link', { name: 'profile.sectionLabels.account' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the admin shortcut and sign-out on small screens only, sign-out not in danger colour (#774)', () => {
    render(<ProfileClient />);
    const admin = screen.getByRole('button', { name: 'profile.adminPanelLink' });
    const logout = screen.getByRole('button', { name: 'auth.logout' });
    expect(admin.closest('.md\\:hidden')).not.toBeNull();
    expect(logout.closest('.md\\:hidden')).not.toBeNull();
    expect(logout.getAttribute('data-color')).not.toBe('danger');
  });

  it('hides the admin shortcut from non-admins (#774)', () => {
    mockUser = { id: 'u2', isAdmin: false };
    render(<ProfileClient />);
    expect(screen.queryByRole('button', { name: 'profile.adminPanelLink' })).toBeNull();
    expect(screen.getByRole('button', { name: 'auth.logout' })).toBeInTheDocument();
  });
});
