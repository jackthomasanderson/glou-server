import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';

let pathname = '/bottles';
// #203 (skip link) and #195 (connectivity indicator reachable on every screen size).

vi.mock('next/navigation', () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@heroui/react', () => ({
  Avatar: () => <span />,
  Button: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock('../Sidebar', () => ({ Sidebar: () => <nav data-testid="sidebar"><a href="/x">nav link</a></nav> }));
vi.mock('../BottomNav', () => ({ BottomNav: () => null }));
vi.mock('../GlobalSearch', () => ({ GlobalSearch: () => <input aria-label="search" />, MobileSearch: () => null }));
vi.mock('../NotificationBell', () => ({ NotificationBell: () => <button type="button">bell</button> }));
vi.mock('../ConnectivityIndicator', () => ({ ConnectivityIndicator: () => <button type="button" data-testid="connectivity">net</button> }));
vi.mock('../../offline/ConflictResolutionModal', () => ({ ConflictResolutionModal: () => null }));
vi.mock('../../auth/AuthGuard', () => ({ AuthGuard: ({ children }: { children?: ReactNode }) => <>{children}</> }));
let me: { appName: string; username: string; isAdmin?: boolean } = { appName: 'Glou', username: 'a' };
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: me }) }));
// #671: the backup state, as GET /admin/backups/health gives it (only fetched for an administrator).
let health: Record<string, unknown> | undefined;
const useAdminBackupHealth = vi.fn((options?: { enabled?: boolean }) => ({ data: options?.enabled === false ? undefined : health }));
vi.mock('@/hooks/useAdmin', () => ({ useAdminBackupHealth: (options?: { enabled?: boolean }) => useAdminBackupHealth(options) }));
vi.mock('@/hooks/useAutoLock', () => ({ useAutoLock: () => ({ lockNow: vi.fn() }) }));

import { MainLayout } from '../MainLayout';

const failing = { directoryWritable: true, backupEnabled: true, lastSuccessAt: '2026-11-01T03:00:00.000Z', lastRunFailed: true, overdue: true };

describe('MainLayout', () => {
  it('starts with a skip link that targets the main landmark (#203)', () => {
    const { container } = render(<MainLayout protected={false}><p>page</p></MainLayout>);
    const focusable = Array.from(container.querySelectorAll<HTMLElement>('a[href], button, input'));
    const first = focusable[0];
    expect(first.textContent).toBe('nav.skipToContent');
    expect(first.getAttribute('href')).toBe('#main-content');
    const main = screen.getByRole('main');
    expect(main.id).toBe('main-content');
    expect(main.getAttribute('tabindex')).toBe('-1'); // so the jump really moves focus
  });

  it('keeps the skip link out of sight until focused', () => {
    render(<MainLayout protected={false}><p>page</p></MainLayout>);
    const link = screen.getByText('nav.skipToContent');
    expect(link.className).toContain('sr-only');
    expect(link.className).toContain('focus:not-sr-only');
  });

  // #776: HeroUI gives outside-placed field labels z-20; the sticky top bar must
  // sit above that level or labels slide over it when the page scrolls.
  it('stacks the sticky top bar above the z-20 of HeroUI field labels (#776)', () => {
    render(<MainLayout protected={false}><p>page</p></MainLayout>);
    expect(screen.getByRole('banner').className).toMatch(/\bz-30\b/);
  });

  it('renders the connectivity indicator in the header, outside the sidebar (#195)', () => {
    render(<MainLayout protected={false}><p>page</p></MainLayout>);
    const indicator = screen.getByTestId('connectivity');
    expect(screen.getByRole('banner').contains(indicator)).toBe(true);
    expect(screen.getByTestId('sidebar').contains(indicator)).toBe(false);
  });

  it('ends the breadcrumb and the tab title with the page under its section (a cellar, recette #471)', async () => {
    render(<MainLayout protected={false} crumb="Cave du garage"><p>page</p></MainLayout>);
    const banner = screen.getByRole('banner');
    expect(banner.textContent).toContain('nav.bottles>Cave du garage');
    await vi.waitFor(() => expect(document.title).toMatch(/^Cave du garage — /));
  });

  // #913: "Glou" is a link back to the home page (the admin page included).
  it('makes the breadcrumb root a link (#913)', () => {
    pathname = '/admin';
    render(<MainLayout protected={false}><p>page</p></MainLayout>);
    const root = within(screen.getByRole('banner')).getByRole('link', { name: 'Glou' });
    expect(root.getAttribute('href')).toBe('/');
  });

  // #671: on an install without email or Gotify, a failing nightly backup was
  // reported to no one. Administrators now see it on every page.
  describe('backup alert (#671)', () => {
    const setup = (user: typeof me, state: Record<string, unknown> | undefined, path = '/bottles') => {
      me = user;
      health = state;
      pathname = path;
      useAdminBackupHealth.mockClear();
      return render(<MainLayout protected={false}><p>page</p></MainLayout>);
    };
    const admin = { appName: 'Glou', username: 'boss', isAdmin: true };
    const member = { appName: 'Glou', username: 'paul', isAdmin: false };

    it('tells an administrator, on any page, that the last backup failed and is overdue, with the way to Admin → Data', () => {
      setup(admin, failing);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('admin.backupWarning.failed');
      expect(alert).toHaveTextContent('admin.backupWarning.overdue');
      expect(within(alert).getByRole('link', { name: 'admin.backupWarning.open' }).getAttribute('href')).toBe('/admin?tab=data');
    });

    it('tells an administrator of an overdue backup alone', () => {
      setup(admin, { ...failing, lastRunFailed: false });
      expect(screen.getByRole('alert')).not.toHaveTextContent('admin.backupWarning.failed');
      expect(screen.getByRole('alert')).toHaveTextContent('admin.backupWarning.overdue');
    });

    it('never shows it to a member, who does not even ask for the backup state', () => {
      setup(member, failing);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(useAdminBackupHealth).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('shows nothing while the backups are fine, or switched off (said on the admin page only)', () => {
      setup(admin, { ...failing, lastRunFailed: false, overdue: false });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(useAdminBackupHealth).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('leaves the admin page to its own warning, which already lists it', () => {
      setup(admin, failing, '/admin');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
