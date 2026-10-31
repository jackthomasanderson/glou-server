import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { ProductDetailView } from '@/lib/products/types';

// #471 (FEAT-05): "Restaurer cette valeur" in a wine's history — on a change
// of one of its bottles (restored on the bottle) and on a change of the
// wine's description, which has no bottle (restored on the wine).

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));

const mutation = (over: Record<string, unknown> = {}) => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, ...over });
let itemRollback = mutation();
let productRollback = mutation();
vi.mock('@/hooks/useInventory', () => ({ useRollbackField: () => itemRollback }));
vi.mock('@/hooks/useRollbackProductField', () => ({ useRollbackProductField: () => productRollback }));

import { FamilyHistory } from '../FamilyHistory';

type Entry = ProductDetailView['history'][number];
const entry = (over: Partial<Entry>): Entry => ({
  id: 1, action: 'UPDATE', status: 'success', actorId: 'u', actorName: 'Marie', itemId: null,
  changes: [{ field: 'region', from: 'Bordeaux', to: 'Médoc' }], createdAt: '2026-10-30T10:00:00.000Z', ...over,
});

function renderHistory(history: Entry[], itemIds: string[] = ['b1']) {
  return render(
    <FamilyHistory
      productId="p1"
      productUpdatedAt="2026-10-30T10:00:00.000Z"
      history={history}
      itemIds={new Set(itemIds)}
      cellarName={() => undefined}
    />,
  );
}

const restoreButtons = () => screen.queryAllByRole('button', { name: 'Restaurer cette valeur' });

async function confirmRestore() {
  fireEvent.click(restoreButtons()[0]);
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Le champ « Région » sera restauré à : Bordeaux.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurer' }));
}

beforeEach(() => {
  itemRollback = mutation();
  productRollback = mutation();
});

describe('FamilyHistory — restoring a value (FEAT-05)', () => {
  it('restores a change of the wine\'s description on the wine, from its version as read', async () => {
    renderHistory([entry({})]);

    await confirmRestore();

    expect(productRollback.mutate).toHaveBeenCalledWith(
      { id: 'p1', field: 'region', toValue: 'Bordeaux', expectedUpdatedAt: '2026-10-30T10:00:00.000Z' },
      expect.anything(),
    );
    expect(itemRollback.mutate).not.toHaveBeenCalled();
  });

  it('still restores a change of a bottle still there on the bottle', async () => {
    renderHistory([entry({ itemId: 'b1' })]);

    await confirmRestore();

    expect(itemRollback.mutate).toHaveBeenCalledWith({ id: 'b1', field: 'region', toValue: 'Bordeaux' }, expect.anything());
    expect(productRollback.mutate).not.toHaveBeenCalled();
  });

  it('offers nothing for what is not a written field of the wine, nor for a bottle no longer there', () => {
    renderHistory([
      entry({ id: 2, changes: [{ field: 'alertStatus', from: 'none', to: 'peak' }, { field: 'otherPhotoUrls', from: [], to: ['x'] }] }),
      entry({ id: 3, itemId: 'gone' }),
      entry({ id: 4, action: 'DELETE', changes: null }),
    ]);

    expect(restoreButtons()).toHaveLength(0);
  });

  it('offers one restore per field of the wine changed', () => {
    renderHistory([entry({ changes: [{ field: 'region', from: 'Bordeaux', to: 'Médoc' }, { field: 'vintage', from: 2019, to: 2020 }] })]);

    expect(restoreButtons()).toHaveLength(2);
  });

  it('says when the restore failed, and keeps the confirmation open', async () => {
    productRollback = mutation({ isError: true });
    renderHistory([entry({})]);

    await confirmRestore();

    expect(screen.getByRole('dialog')).toHaveTextContent('Impossible de restaurer cette valeur.');
  });

  it('closing the confirmation forgets a past failure of either kind', async () => {
    renderHistory([entry({})]);
    fireEvent.click(restoreButtons()[0]);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annuler' }));

    expect(productRollback.reset).toHaveBeenCalled();
    expect(itemRollback.reset).toHaveBeenCalled();
  });
});
