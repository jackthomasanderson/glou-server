import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// #204 — the active tab differed by colour only, no link carried aria-current,
// and the root of the bar was a <div> rather than a navigation landmark.

let pathname = '/cellars';
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => searchParams,
}));
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
    // ISSUE_434: caves moved into the "More" sheet (now a category-tabs
    // row) — cigars stays a primary tab, unaffected by that move.
    pathname = '/cigars';
    render(<BottomNav />);
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('aria-label')).toBe('nav.cigars');
  });

  it('adds a non-colour cue (bar + heavier label) to the active tab', () => {
    pathname = '/cigars';
    const { container } = render(<BottomNav />);
    const active = screen.getByRole('button', { name: 'nav.cigars' });
    expect(active.querySelector('span[aria-hidden="true"].bg-primary')).toBeTruthy();
    expect(active.textContent).toBe('nav.cigars');
    expect(active.querySelector('.font-extrabold')).toBeTruthy();
    const inactive = screen.getByRole('button', { name: 'nav.wines' });
    expect(inactive.querySelector('.bg-primary')).toBeNull();
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('flags the "More" tab when the current page lives behind it', () => {
    pathname = '/cellar-journal';
    searchParams = new URLSearchParams();
    render(<BottomNav />);
    const more = screen.getByRole('button', { name: 'nav.more' });
    expect(more.querySelector('span[aria-hidden="true"].bg-primary')).toBeTruthy();
  });

  // ISSUE_434: caves/collections/tastings/inventory-count/wishlist/analytics
  // are transversal (span every category) and now live behind "More";
  // wine/sparkling/spirit/cigar are the 4 primary category tabs.
  it('flags "More" (not a primary tab) when the current page is a transversal view', () => {
    pathname = '/cellars';
    searchParams = new URLSearchParams();
    render(<BottomNav />);
    expect(screen.queryByRole('button', { name: 'nav.caves' })).toBeNull();
    const more = screen.getByRole('button', { name: 'nav.more' });
    expect(more.getAttribute('aria-current')).toBeNull();
    expect(more.querySelector('span[aria-hidden="true"].bg-primary')).toBeTruthy();
  });

  it('marks the matching category tab active via the ?category= query param, not the whole /bottles path', () => {
    pathname = '/bottles';
    searchParams = new URLSearchParams('category=spirit');
    render(<BottomNav />);
    const spirits = screen.getByRole('button', { name: 'nav.spirits' });
    expect(spirits.getAttribute('aria-current')).toBe('page');
    const wines = screen.getByRole('button', { name: 'nav.wines' });
    expect(wines.getAttribute('aria-current')).toBeNull();
  });
});
