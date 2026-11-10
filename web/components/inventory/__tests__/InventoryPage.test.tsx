import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => {
  t = await frenchT();
  // HeroUI's tab cursor measures the tab list; jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o) }) }));
vi.mock('@/components/ui/MainLayout', () => ({
  MainLayout: ({ children, crumb }: { children: React.ReactNode; crumb?: string }) => (
    <div data-testid="layout" data-crumb={crumb ?? ''}>{children}</div>
  ),
}));
let mockCategory: string | null = null;
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockCategory ? `category=${mockCategory}` : ''),
}));
vi.mock('../InventoryDashboard', () => ({ InventoryDashboard: () => <div data-testid="dashboard" /> }));
vi.mock('../InventoryTrash', () => ({ InventoryTrash: () => <div data-testid="trash" /> }));

import { InventoryPage } from '../InventoryPage';

// #701: the bottles and cigars pages share the page header; the tabs sit
// under the title, and the trash has its own breadcrumb step / tab title.
describe('InventoryPage (#701)', () => {
  it('shows the page title above the inventory / trash tabs', () => {
    render(<InventoryPage lockedCategories={['wine', 'sparkling', 'spirit']} />);
    const h1 = screen.getByRole('heading', { level: 1, name: t('nav.bottles') });
    const tablist = screen.getByRole('tablist');
    expect(h1.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('titles the cigars page', () => {
    render(<InventoryPage lockedCategories={['cigar']} />);
    expect(screen.getByRole('heading', { level: 1, name: t('nav.cigars') })).toBeInTheDocument();
  });

  it('names the trash in the breadcrumb and the browser tab once it is open', () => {
    render(<InventoryPage lockedCategories={['wine', 'sparkling', 'spirit']} />);
    expect(screen.getByTestId('layout')).toHaveAttribute('data-crumb', '');
    fireEvent.click(screen.getByRole('tab', { name: t('inventory.tabs.trash') }));
    expect(screen.getByTestId('trash')).toBeInTheDocument();
    expect(screen.getByTestId('layout')).toHaveAttribute('data-crumb', t('inventory.tabs.trash'));
  });

  it.each([['wine', 'nav.wines'], ['sparkling', 'nav.sparkling'], ['spirit', 'nav.spirits']])(
    '#503: the title follows the %s category',
    (category, key) => {
      mockCategory = category;
      render(<InventoryPage lockedCategories={['wine', 'sparkling', 'spirit']} />);
      mockCategory = null;
      expect(screen.getByRole('heading', { level: 1, name: t(key) })).toBeInTheDocument();
    },
  );
});
