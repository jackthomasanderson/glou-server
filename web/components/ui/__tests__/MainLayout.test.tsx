import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// #203 (skip link) and #195 (connectivity indicator reachable on every screen size).

vi.mock('next/navigation', () => ({ usePathname: () => '/bottles' }));
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
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: { appName: 'Glou', username: 'a' } }) }));
vi.mock('@/hooks/useAutoLock', () => ({ useAutoLock: () => ({ lockNow: vi.fn() }) }));

import { MainLayout } from '../MainLayout';

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

  it('renders the connectivity indicator in the header, outside the sidebar (#195)', () => {
    render(<MainLayout protected={false}><p>page</p></MainLayout>);
    const indicator = screen.getByTestId('connectivity');
    expect(screen.getByRole('banner').contains(indicator)).toBe(true);
    expect(screen.getByTestId('sidebar').contains(indicator)).toBe(false);
  });
});
