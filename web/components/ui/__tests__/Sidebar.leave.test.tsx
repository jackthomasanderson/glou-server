import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { registerLeaveQuestion } from '@/lib/leaveGuard';

// #759: signing out from the sidebar does not drop unsaved settings without
// a question.

const logout = vi.fn();
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'a1', username: 'admin', isAdmin: true } }),
  useLogout: () => ({ mutate: logout, isPending: false }),
}));
vi.mock('@/hooks/useSidebarCounts', () => ({ useSidebarCounts: () => ({ data: undefined }) }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('../ThemeToggle', () => ({ ThemeToggle: () => null }));

import { Sidebar } from '../Sidebar';

afterEach(() => {
  logout.mockReset();
  vi.restoreAllMocks();
});

describe('Sidebar sign-out — unsaved changes (#759)', () => {
  it('stays signed in when the person declines, signs out when they confirm', () => {
    const unregister = registerLeaveQuestion('Leave without saving?');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      render(<Sidebar />);
      fireEvent.click(screen.getByRole('button', { name: 'auth.logout' }));
      expect(confirm).toHaveBeenCalledWith('Leave without saving?');
      expect(logout).not.toHaveBeenCalled();

      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'auth.logout' }));
      expect(logout).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it('signs out at once when nothing is pending', () => {
    const confirm = vi.spyOn(window, 'confirm');
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'auth.logout' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
