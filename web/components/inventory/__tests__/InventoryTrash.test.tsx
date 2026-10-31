import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #471 (D10): the trash lists the wines thrown away too, once, with the
// bottles that went with them; "Restaurer" brings the wine back.

const when = new Date().toISOString();
const restoreWine = vi.fn();
const restoreItem = vi.fn();
const data = vi.hoisted(() => ({ wines: [] as unknown[], items: [] as unknown[] }));
vi.mock('@/hooks/useProducts', () => ({
  useProductsTrash: () => ({ data: data.wines, isLoading: false, isError: false }),
  useRestoreProduct: () => ({ mutate: restoreWine, isPending: false }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventoryTrash: () => ({ data: data.items, isLoading: false, isError: false }),
  useRestoreInventoryItem: () => ({ mutate: restoreItem, isPending: false }),
}));

import { InventoryTrash } from '../InventoryTrash';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

describe('InventoryTrash with wines', () => {
  it('lists a wine thrown away with its bottles once, and restores it', () => {
    data.wines = [{ ...product({ id: 'w1', name: 'Cuvée X', items: [unit({ quantity: 6, deletedAt: when })] }), deletedAt: when }];
    data.items = [
      { id: 'b-with-wine', productId: 'w1', deletedAt: when, category: 'wine', name: 'Cuvée X', producer: 'Domaine' },
      { id: 'b-alone', productId: 'w2', deletedAt: when, category: 'wine', name: 'Autre Vin', producer: 'Domaine' },
    ];
    render(<InventoryTrash t={t} />);
    const wines = screen.getByTestId('trash-wines');
    expect(within(wines).getByText(/Cuvée X/)).toBeInTheDocument();
    expect(within(wines).getByText(/avec 6 bouteilles/)).toBeInTheDocument();
    // The bottles thrown with the wine are not listed a second time.
    expect(screen.getAllByText(/Cuvée X/)).toHaveLength(1);
    expect(screen.getByText(/Autre Vin/)).toBeInTheDocument();

    fireEvent.click(within(wines).getByRole('button', { name: 'Restaurer' }));
    expect(restoreWine).toHaveBeenCalledWith('w1');
    expect(restoreItem).not.toHaveBeenCalled();
  });

  it('a wine without any bottle is still listed, so it can be restored', () => {
    data.wines = [{ ...product({ id: 'w3', name: 'Goûté Ailleurs', items: [] }), deletedAt: when }];
    data.items = [];
    render(<InventoryTrash t={t} />);
    expect(screen.getByText(/Goûté Ailleurs/)).toBeInTheDocument();
    expect(screen.queryByText('La corbeille est vide.')).toBeNull();
  });
});
