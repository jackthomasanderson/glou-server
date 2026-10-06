import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// #204 — the active tab differed by colour only, no link carried aria-current,
// and the root of the bar was a <div> rather than a navigation landmark.

let pathname = '/cellars';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@heroui/react', () => ({
  Button: ({ children, 'aria-current': current }: { children?: ReactNode; 'aria-current'?: 'page' }) => (
    <button type="button" aria-current={current}>{children}</button>
  ),
  Modal: () => null,
  ModalContent: () => null,
  ModalBody: () => null,
}));

import { BottomNav } from '../BottomNav';

describe('BottomNav accessibility (#204)', () => {
  it('is a named navigation landmark', () => {
    render(<BottomNav />);
    expect(screen.getByRole('navigation', { name: 'nav.primary' })).toBeTruthy();
  });

  it('marks only the current tab with aria-current="page"', () => {
    pathname = '/cellars';
    render(<BottomNav />);
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('aria-label')).toBe('nav.caves');
  });

  it('adds a non-colour cue (bar + heavier label) to the active tab', () => {
    pathname = '/cellars';
    const { container } = render(<BottomNav />);
    const active = screen.getByRole('button', { name: 'nav.caves' });
    expect(active.querySelector('span[aria-hidden="true"].bg-primary')).toBeTruthy();
    expect(active.textContent).toBe('nav.caves');
    expect(active.querySelector('.font-extrabold')).toBeTruthy();
    const inactive = screen.getByRole('button', { name: 'nav.bottles' });
    expect(inactive.querySelector('.bg-primary')).toBeNull();
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('flags the "More" tab when the current page lives behind it', () => {
    pathname = '/tastings';
    render(<BottomNav />);
    const more = screen.getByRole('button', { name: 'nav.more' });
    expect(more.querySelector('span[aria-hidden="true"].bg-primary')).toBeTruthy();
  });
});
