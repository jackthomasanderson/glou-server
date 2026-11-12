import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// FEAT-115 (#990): at the bottom of the sidebar, administrators get the
// installed version and a What's New? link that reopens the window. A member
// gets neither (useWhatsNew() is null for them).

const open = vi.fn();
let whatsNew: { open: () => void; version: string | undefined } | null = null;
let isAdmin = true;

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/bottles', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'u1', username: 'someone', isAdmin } }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useSidebarCounts', () => ({ useSidebarCounts: () => ({ data: undefined }) }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('../ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/whats-new/WhatsNewProvider', () => ({ useWhatsNew: () => whatsNew }));

import { Sidebar } from '../Sidebar';

beforeEach(() => {
  open.mockReset();
  isAdmin = true;
  whatsNew = { open, version: '2026.12' };
});

describe('Sidebar What\'s New? link (#990)', () => {
  it('shows an administrator the version and a link that reopens the window', () => {
    render(<Sidebar />);
    expect(screen.getByText('2026.12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'whatsNew.open' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('shows a member neither', () => {
    isAdmin = false;
    whatsNew = null;
    render(<Sidebar />);
    expect(screen.queryByRole('button', { name: 'whatsNew.open' })).toBeNull();
    expect(screen.queryByText('2026.12')).toBeNull();
  });
});
