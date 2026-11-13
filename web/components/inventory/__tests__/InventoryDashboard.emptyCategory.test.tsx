import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { product } from '@/lib/products/__tests__/factories';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => {
  t = await frenchT();
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});

const push = vi.fn();
const router = { push, replace: vi.fn() };
let params = new URLSearchParams('category=wine');
let products: unknown[] = [];
vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
  useRouter: () => router,
  usePathname: () => '/bottles',
}));
// #637: a `dynamic` component downloads its code when it first renders; the stub counts renders.
const lazyRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('next/dynamic', () => ({
  default: () => (props: { open?: boolean; defaultCategory?: string }) => {
    lazyRenders.count += 1;
    return props.open ? <div data-testid="form" data-category={props.defaultCategory ?? ''} /> : null;
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'fr' } }) }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: [] }),
  useInventoryTruncated: () => false,
  useBulkUpdateInventoryItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: products, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
  useProductsTruncated: () => false,
  useTrashProduct: () => ({ mutate: vi.fn() }),
  useRestoreProduct: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useCreateFromForm', () => ({ useCreateFromForm: () => ({ create: vi.fn(), isPending: false }) }));
vi.mock('@/hooks/useOfflineSync', () => ({ useOfflineSync: () => ({ queue: [] }) }));
vi.mock('@/hooks/useScan', () => ({ useScanAvailability: () => false }));
vi.mock('@/hooks/useViewMode', () => ({ useViewMode: () => ['grid', vi.fn()] }));
vi.mock('@/hooks/usePageSize', () => ({ usePageSize: () => [24, vi.fn()] }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/components/ui/ViewToggle', () => ({ ViewToggle: () => null }));
vi.mock('@/components/ui/PageSizeToggle', () => ({ PageSizeToggle: () => null }));
vi.mock('../InventoryFilterBar', () => ({
  InventoryFilterBar: ({ hasActiveFilters }: { hasActiveFilters: boolean }) => <div data-testid="filter-bar" data-active={String(hasActiveFilters)} />,
  InventoryFilterToggleButton: () => null,
}));
vi.mock('../InventoryBulkBar', () => ({ InventoryBulkBar: () => null, InventoryBulkToggleButton: () => null }));
vi.mock('../BulkWinesDialog', () => ({ BulkWinesDialog: () => null }));
vi.mock('../InventoryGridView', () => ({ InventoryGridView: () => null }));
vi.mock('../InventoryListView', () => ({ InventoryListView: () => null }));
vi.mock('../InventoryStatsLine', () => ({ InventoryStatsLine: () => null }));
vi.mock('../InventoryBanners', () => ({ InventoryBanners: () => null }));
vi.mock('../TrashWineDialog', () => ({ TrashWineDialog: () => null }));
vi.mock('../InventoryCard', () => ({ InventoryCardSkeleton: () => null }));
vi.mock('../InventoryListRow', () => ({ InventoryListRowSkeleton: () => null }));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, ...rest }: { children?: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress} data-testid={(rest as Record<string, string>)['data-testid']}>{children}</button>
  ),
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

import { InventoryDashboard } from '../InventoryDashboard';

const wrap = (ui: ReactNode) => render(ui);

// #503: "?category=wine" is the page, not a filter.
describe('an empty category page (#503)', () => {
  it('offers to add a wine instead of "no result for these filters"', () => {
    params = new URLSearchParams('category=wine');
    products = [];
    wrap(<InventoryDashboard t={t as never} lockedCategories={['wine', 'sparkling', 'spirit']} />);
    expect(screen.getByText(t('inventory.noCategory_wine'))).toBeInTheDocument();
    expect(screen.queryByText(t('inventory.resetFilters'))).toBeNull();
    for (const bar of screen.getAllByTestId('filter-bar')) expect(bar).toHaveAttribute('data-active', 'false');
    fireEvent.click(screen.getAllByRole('button', { name: t('inventory.add') }).at(-1)!);
    expect(screen.getByTestId('form')).toHaveAttribute('data-category', 'wine');
  });

  // #840: the cellar holds wines, but no sparkling one.
  it('an empty Sparkling page in a cellar of red wines says so and offers to add one', () => {
    params = new URLSearchParams('category=sparkling');
    products = [product({ category: 'wine', color: 'red' })];
    wrap(<InventoryDashboard t={t as never} lockedCategories={['wine', 'sparkling', 'spirit']} />);
    expect(screen.getByText(t('inventory.noCategory_sparkling'))).toBeInTheDocument();
    expect(screen.queryByText(t('inventory.noResultsFilters'))).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: t('inventory.add') }).at(-1)!);
    expect(screen.getByTestId('form')).toHaveAttribute('data-category', 'sparkling');
  });

  it('links to all bottles', () => {
    params = new URLSearchParams('category=spirit');
    products = [];
    wrap(<InventoryDashboard t={t as never} lockedCategories={['wine', 'sparkling', 'spirit']} />);
    fireEvent.click(screen.getByTestId('see-all-bottles'));
    expect(push).toHaveBeenCalledWith('/bottles');
  });
});

// #637: the form, drawer, edit dialog and scan flow are only rendered once opened.
describe('lazy dialogs (#637)', () => {
  it('renders none of them while closed, the form once "Add" is pressed', () => {
    params = new URLSearchParams('category=wine');
    products = [];
    lazyRenders.count = 0;
    wrap(<InventoryDashboard t={t as never} lockedCategories={['wine', 'sparkling', 'spirit']} />);
    expect(lazyRenders.count).toBe(0);
    fireEvent.click(screen.getAllByRole('button', { name: t('inventory.add') }).at(-1)!);
    expect(screen.getByTestId('form')).toBeInTheDocument();
  });
});
