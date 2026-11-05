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
      // Written by a merge, never by the description edit: the API would refuse it.
      entry({ id: 5, action: 'MERGE_PRODUCTS', changes: [{ field: 'consumptionPostponedUntil', from: null, to: '2027-01-01T00:00:00.000Z' }] }),
      entry({ id: 3, itemId: 'gone' }),
      entry({ id: 4, action: 'DELETE', changes: null }),
    ]);

    expect(restoreButtons()).toHaveLength(0);
  });

  // #471 (lot Z): "Stocker cette référence" (FEAT-87) left this in the history of a bottle still there.
  it('offers nothing for the former reference flag of a bottle', () => {
    renderHistory([entry({ itemId: 'b1', changes: [{ field: 'isOwned', from: false, to: true }] })]);

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

  it('says the wine changed meanwhile when the restore is refused (409)', async () => {
    productRollback = mutation({ isError: true, error: new Error('CONFLICT') });
    renderHistory([entry({})]);

    await confirmRestore();

    expect(screen.getByRole('dialog')).toHaveTextContent('ce vin a été modifié entre-temps');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Impossible de restaurer cette valeur.');
  });

  it('closing the confirmation forgets a past failure of either kind', async () => {
    renderHistory([entry({})]);
    fireEvent.click(restoreButtons()[0]);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annuler' }));

    expect(productRollback.reset).toHaveBeenCalled();
    expect(itemRollback.reset).toHaveBeenCalled();
  });
});

describe('FamilyHistory — review after the update (#471, FEAT-102)', () => {
  it('says a merge and the values it chose; they stay restorable on the wine', () => {
    renderHistory([entry({ action: 'MERGE_PRODUCTS', changes: [{ field: 'region', from: 'Bordeaux', to: 'Graves' }] })]);

    expect(screen.getByTestId('family-history')).toHaveTextContent('Vins regroupés · Région : Graves');
    expect(restoreButtons()).toHaveLength(1);
  });

  it('says « Références regroupées » for cigars', () => {
    render(
      <FamilyHistory
        productId="p1"
        productUpdatedAt="2026-10-30T10:00:00.000Z"
        history={[entry({ action: 'MERGE_PRODUCTS', changes: [] })]}
        itemIds={new Set()}
        cellarName={() => undefined}
        nounOf={() => 'cigar'}
      />,
    );

    expect(screen.getByTestId('family-history')).toHaveTextContent('Références regroupées');
  });

  it('says "Nombre vérifié" for "C\'est bon", with nothing to restore', () => {
    renderHistory([entry({ action: 'REVIEW_OK', itemId: 'b1', changes: [{ field: 'needsReview', from: true, to: false }] })]);

    expect(screen.getByTestId('family-history')).toHaveTextContent('Nombre vérifié');
    expect(screen.getByTestId('family-history')).not.toHaveTextContent('REVIEW_OK');
    expect(restoreButtons()).toHaveLength(0);
  });

  it('never offers to restore a change recorded on a line since absorbed by this one (it would rewrite all its bottles)', () => {
    renderHistory([
      entry({ id: 1, itemId: 'b1', absorbed: true, changes: [{ field: 'purchasePlace', from: null, to: 'Foire' }] }),
      entry({ id: 2, itemId: 'b1', changes: [{ field: 'location', from: 'Rack A', to: 'Rack B' }] }),
    ]);

    // Only the line's own change keeps its button.
    expect(restoreButtons()).toHaveLength(1);
    expect(restoreButtons()[0].closest('li')).toHaveTextContent('Rack B');
  });

  // Recette #471 (KO 4.2): bottles added as a new line of their own.
  it('says "Bouteilles ajoutées : 2" for an add that made a new line, never "Quantité : 2"', () => {
    renderHistory([
      entry({ id: 1, action: 'ADD_UNITS', itemId: 'b2', changes: [{ field: 'quantity', from: null, to: 2 }] }),
      entry({ id: 2, action: 'ADD_UNITS', itemId: 'b1', changes: [{ field: 'quantity', from: 4, to: 6 }] }),
    ], ['b1', 'b2']);

    const [created, completed] = within(screen.getByTestId('family-history')).getAllByRole('listitem');
    expect(created).toHaveTextContent('Bouteilles ajoutées : 2');
    expect(created).not.toHaveTextContent('Quantité');
    expect(completed).toHaveTextContent('Bouteilles ajoutées : 4 → 6');
    expect(restoreButtons()).toHaveLength(0);
  });
});

// FEAT-93 (#847, lot S4): the cells of the plan in a wine's history — said
// in words, never restored from here; older coordinates still read.
describe('FamilyHistory — cells of the plan (FEAT-93)', () => {
  it('says a cell freed, placed or moved, with no « Restaurer »', () => {
    renderHistory([
      entry({ id: 1, itemId: 'b1', changes: [{ field: 'slot', from: { column: 2, row: 3 }, to: null }] }),
      entry({ id: 2, itemId: 'b1', changes: [{ field: 'slot', from: null, to: { column: 1, row: 1 } }] }),
      entry({ id: 3, itemId: 'b1', changes: [{ field: 'slot', from: { column: 1, row: 1 }, to: { column: 2, row: 1 } }] }),
    ]);
    const history = screen.getByTestId('family-history');
    expect(history).toHaveTextContent('Case C2·R3 libérée');
    expect(history).toHaveTextContent('Case C1·R1 occupée');
    expect(history).not.toHaveTextContent('aucune');
    expect(history).toHaveTextContent('Case C1·R1 → C2·R1');
    expect(history).not.toHaveTextContent('column');
    expect(restoreButtons()).toEqual([]);
  });

  it('still reads the coordinates written before, without « Restaurer »', () => {
    renderHistory([entry({ itemId: 'b1', changes: [{ field: 'slotColumn', from: null, to: 3 }, { field: 'slotRow', from: null, to: 2 }] })]);
    expect(screen.getByTestId('family-history')).toHaveTextContent('Colonne : 3 · Rangée : 2');
    expect(restoreButtons()).toEqual([]);
  });
});

// Recette #847: a gesture is said in its own words — "1 bouteille ouverte",
// "1 bouteille bue", "1 cigare fumé" — never as the columns it wrote; a cell
// is said freed only when it was (an opened bottle keeps its cell).
describe('FamilyHistory — gestures (recette #847)', () => {
  const lines = () => within(screen.getByTestId('family-history')).getAllByRole('listitem');
  const opened = [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 100 }, { field: 'openedAt', from: null, to: '2026-11-05T10:00:00.000Z' }];
  const drunk = [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 0 }];

  it('says "1 bouteille ouverte", without a cell freed nor the columns written', () => {
    renderHistory([entry({ itemId: 's', gesture: 'opened', changes: opened })]);
    const [line] = lines();
    expect(line).toHaveTextContent('1 bouteille ouverte');
    expect(line).not.toHaveTextContent('libérée');
    expect(line).not.toHaveTextContent('Bouteille entamée');
    expect(line).not.toHaveTextContent('Niveau');
  });

  it('says the level of a bottle opened short of full', () => {
    renderHistory([entry({ itemId: 's', gesture: 'opened', changes: [{ field: 'isOpened', from: false, to: true }, { field: 'fillLevel', from: null, to: 50 }] })]);
    expect(lines()[0]).toHaveTextContent('1 bouteille ouverte · Niveau ajusté à 50%');
  });

  it('says "1 bouteille bue" and the cell it freed', () => {
    renderHistory([entry({ itemId: 's', gesture: 'finished', changes: [...drunk, { field: 'slot', from: { column: 2, row: 1 }, to: null }] })]);
    const [line] = lines();
    expect(line).toHaveTextContent('1 bouteille bue · Case C2·R1 libérée');
    expect(line).not.toHaveTextContent('Vide');
    expect(restoreButtons()).toEqual([]);
  });

  it('says "1 cigare fumé" for a cigar smoked, from a box or single', () => {
    render(
      <FamilyHistory
        productId="p1"
        productUpdatedAt="2026-10-30T10:00:00.000Z"
        history={[
          entry({ id: 1, itemId: 'box', gesture: 'smoked', changes: [{ field: 'isOpened', from: false, to: true }, { field: 'cigarsLeft', from: null, to: 24 }] }),
          entry({ id: 2, itemId: 'single', gesture: 'finished', changes: drunk }),
        ]}
        itemIds={new Set()}
        cellarName={() => undefined}
        nounOf={(itemId) => (itemId === 'box' ? 'box' : 'cigar')}
      />,
    );
    const [box, single] = lines();
    expect(box).toHaveTextContent('1 cigare fumé');
    expect(box).not.toHaveTextContent('Cigares restants');
    expect(single).toHaveTextContent('1 cigare fumé');
  });

  it('still reads an entry without gesture as before (a level adjusted)', () => {
    renderHistory([entry({ itemId: 'b1', changes: [{ field: 'fillLevel', from: 100, to: 40 }] })]);
    expect(lines()[0]).toHaveTextContent('Niveau ajusté à 40%');
  });

  it('says the cell a bottle moved to another cellar left (KO 6.6)', () => {
    render(
      <FamilyHistory
        productId="p1"
        productUpdatedAt="2026-10-30T10:00:00.000Z"
        history={[entry({
          action: 'MOVE_UNITS', itemId: 'l', count: 1, changes: [
            { field: 'quantity', from: null, to: 1 }, { field: 'cellarId', from: 'c1', to: 'c2' },
            { field: 'slot', from: { column: 2, row: 2 }, to: null },
          ],
        })]}
        itemIds={new Set(['l'])}
        cellarName={(id) => (id === 'c2' ? 'ZZ C5 B' : undefined)}
      />,
    );
    expect(lines()[0]).toHaveTextContent('1 bouteille déplacée vers ZZ C5 B · Case C2·R2 libérée');
  });
});
