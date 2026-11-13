import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { product, unit } from '@/lib/products/__tests__/factories';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => {
  t = await frenchT();
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});

const push = vi.fn();
const router = { push, replace: vi.fn() };
let params = new URLSearchParams('category=wine');
let products: unknown[] = [];
// The trash succeeds at once.
const trash = vi.fn((_id: string, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
const restore = vi.fn();
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
  useTrashProduct: () => ({ mutate: trash, isPending: false }),
  useRestoreProduct: () => ({ mutate: restore }),
}));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useCreateFromForm', () => ({ useCreateFromForm: () => ({ create: vi.fn(), isPending: false }) }));
vi.mock('@/hooks/useOfflineSync', () => ({ useOfflineSync: () => ({ queue: [] }) }));
vi.mock('@/hooks/useScan', () => ({ useScanAvailability: () => false }));
vi.mock('@/hooks/useViewMode', () => ({ useViewMode: () => ['grid', vi.fn()] }));
vi.mock('@/hooks/usePageSize', () => ({ usePageSize: () => [24, vi.fn()] }));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyUndoable: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
vi.mock('@/components/ui/ViewToggle', () => ({ ViewToggle: () => null }));
vi.mock('@/components/ui/PageSizeToggle', () => ({ PageSizeToggle: () => null }));
vi.mock('../InventoryFilterBar', () => ({
  InventoryFilterBar: ({ hasActiveFilters }: { hasActiveFilters: boolean }) => <div data-testid="filter-bar" data-active={String(hasActiveFilters)} />,
  InventoryFilterToggleButton: () => null,
}));
vi.mock('../InventoryBulkBar', () => ({ InventoryBulkBar: () => null, InventoryBulkToggleButton: () => null }));
vi.mock('../BulkWinesDialog', () => ({ BulkWinesDialog: () => null }));
// One "trash" button per wine, as the cards have.
vi.mock('../InventoryGridView', () => ({
  InventoryGridView: ({ items: list, onDelete }: { items: { id: string; name: string }[]; onDelete: (p: unknown) => void }) => (
    <>{list.map((p) => <button key={p.id} type="button" onClick={() => onDelete(p)}>{`trash ${p.name}`}</button>)}</>
  ),
}));
vi.mock('../InventoryListView', () => ({ InventoryListView: () => null }));
vi.mock('../InventoryStatsLine', () => ({ InventoryStatsLine: () => null }));
vi.mock('../InventoryBanners', () => ({ InventoryBanners: () => null }));
vi.mock('../TrashWineDialog', () => ({
  TrashWineDialog: ({ product, onConfirm }: { product: unknown; onConfirm: (p: unknown) => void }) =>
    product ? <button type="button" onClick={() => onConfirm(product)}>confirm</button> : null,
}));
vi.mock('../InventoryCard', () => ({ InventoryCardSkeleton: () => null }));
vi.mock('../InventoryListRow', () => ({ InventoryListRowSkeleton: () => null }));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, ...rest }: { children?: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress} data-testid={(rest as Record<string, string>)['data-testid']}>{children}</button>
  ),
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

import { InventoryDashboard } from '../InventoryDashboard';

const cuveeA = product({ id: 'a', name: 'Cuvée A', vintage: 2020, category: 'wine', items: [unit({ quantity: 2 })] });
const cuveeB = product({ id: 'b', name: 'Cuvée B', vintage: 2019, category: 'wine', items: [unit({ quantity: 1 })] });

function trashWine(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `trash ${name}` }));
  fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
}

// #836: a wine put in the trash offers "Undo" through the app's one undoable
// message, like opening or drinking a bottle (top right, same look and timing).
describe('undoing a wine put in the trash (#836, #651)', () => {
  beforeEach(() => {
    params = new URLSearchParams('category=wine');
    products = [cuveeA, cuveeB];
    toast.notifyUndoable.mockClear();
    restore.mockClear();
  });

  it('shows the shared undoable message, whose "Undo" restores the wine', () => {
    render(<InventoryDashboard t={t as never} lockedCategories={['wine', 'sparkling', 'spirit']} />);
    trashWine('Cuvée A');
    expect(toast.notifyUndoable).toHaveBeenCalledWith('familyList.trash.done', { name: 'Cuvée A 2020' }, expect.any(Function));
    (toast.notifyUndoable.mock.calls[0][2] as () => void)();
    expect(restore).toHaveBeenCalledWith('a');
  });

  // #651 comment: two wines trashed in a row each keep their own "Undo";
  // the second no longer replaces the first.
  it('keeps an "Undo" for each wine trashed in a row', () => {
    render(<InventoryDashboard t={t as never} lockedCategories={['wine', 'sparkling', 'spirit']} />);
    trashWine('Cuvée A');
    trashWine('Cuvée B');
    expect(toast.notifyUndoable).toHaveBeenCalledTimes(2);
    (toast.notifyUndoable.mock.calls[0][2] as () => void)();
    (toast.notifyUndoable.mock.calls[1][2] as () => void)();
    expect(restore.mock.calls.map((call) => call[0])).toEqual(['a', 'b']);
  });
});
