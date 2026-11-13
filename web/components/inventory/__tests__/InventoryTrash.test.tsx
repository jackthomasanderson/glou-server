import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
// #962: deleting for good is for administrators, never offline.
const session = vi.hoisted(() => ({ isAdmin: false, reachable: true as boolean | null }));
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: { id: 'u1', isAdmin: session.isAdmin } }) }));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => session.reachable }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: React.ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async (importActual) => ({
  ...(await importActual<typeof import('@heroui/react')>()),
  ModalContent: ({ children }: { children?: React.ReactNode | (() => React.ReactNode) }) => (
    <>{typeof children === 'function' ? children() : children}</>
  ),
  ModalHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o), i18n: { language: 'fr' } }) }));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));
const deleteItem = vi.fn();
const deleteWine = vi.fn();
const emptyTrash = vi.fn();
vi.mock('@/hooks/usePermanentDelete', () => ({
  useDeleteTrashedItem: () => ({ mutate: deleteItem, isPending: false }),
  useDeleteTrashedProduct: () => ({ mutate: deleteWine, isPending: false }),
  useEmptyTrash: () => ({ mutate: emptyTrash, isPending: false }),
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
    // #844: "6 bouteilles · …", no dangling "avec".
    expect(within(wines).getByText(/^6 bouteilles · /)).toBeInTheDocument();
    expect(within(wines).queryByText(/avec/)).toBeNull();
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

  // Recette #471: a line of several bottles (boxes) says how many went to the trash.
  it('every line says how many, a single bottle included (#844)', () => {
    data.wines = [];
    data.items = [
      { id: 'six', productId: 'w4', deletedAt: when, category: 'wine', name: 'Six', producer: 'D', quantity: 6, isOpened: false },
      { id: 'boxes', productId: 'w5', deletedAt: when, category: 'cigar', name: 'Robusto', producer: 'M', quantity: 2, cigarsPerBox: 25, isOpened: false },
      { id: 'one', productId: 'w6', deletedAt: when, category: 'wine', name: 'Seule', producer: 'D', quantity: 1, isOpened: false },
    ];
    render(<InventoryTrash t={t} />);
    const [six, boxes, one] = screen.getAllByRole('listitem');
    expect(six).toHaveTextContent('6 bouteilles');
    expect(boxes).toHaveTextContent('2 boîtes');
    expect(one).toHaveTextContent('1 bouteille · ');
  });

  // #844: the same wine can have several lines; the trash says which one it was.
  it('a line says which one it was: its cellar and price, as the drawer does', () => {
    data.wines = [];
    data.items = [
      { id: 'g', productId: 'w7', deletedAt: when, category: 'wine', name: 'Margaux', producer: 'Château', quantity: 2, isOpened: false, cellarId: 'garage', purchasePrice: 20 },
    ];
    render(<InventoryTrash t={t} />);
    expect(screen.getByRole('listitem').textContent?.replace(/\s/g, ' ')).toMatch(/2 bouteilles · Garage · 20 € \/ bouteille · /);
  });
});

// #471 (recette v2): a box thrown away read « Restaurer la bouteille », with
// no word of how many went to the trash.
describe('InventoryTrash names what was thrown away', () => {
  it('a box of cigars: its count and size, and « Restaurer la boîte »', () => {
    data.wines = [];
    data.items = [
      { id: 'box', deletedAt: when, category: 'cigar', name: 'Robusto', producer: 'Cohiba', quantity: 2, cigarsPerBox: 25, isOpened: false },
      { id: 'single', deletedAt: when, category: 'cigar', name: 'Corona', producer: 'Partagas', quantity: 3, cigarsPerBox: null, isOpened: false },
      { id: 'bottle', deletedAt: when, category: 'wine', name: 'Margaux', producer: 'Château', quantity: 6, isOpened: false },
    ];
    render(<InventoryTrash t={t} />);
    expect(screen.getByText(/^2 boîtes · /)).toBeInTheDocument();
    expect(screen.getByText(/3 cigares/)).toBeInTheDocument();
    expect(screen.getByText(/6 bouteilles/)).toBeInTheDocument();
    // Recette v3: a line of several is restored in the plural.
    expect(screen.getByRole('button', { name: 'Restaurer les boîtes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurer les cigares' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurer les bouteilles' })).toBeInTheDocument();
  });

  // Recette v3: on the cigars page a single box or cigar said nothing of its number.
  it('a single box or cigar says its number, restored in the singular', () => {
    data.wines = [];
    data.items = [
      { id: 'box', deletedAt: when, category: 'cigar', name: 'Robusto', producer: 'Cohiba', quantity: 1, cigarsPerBox: 25, isOpened: false },
      { id: 'single', deletedAt: when, category: 'cigar', name: 'Corona', producer: 'Partagas', quantity: 1, cigarsPerBox: null, isOpened: false },
      { id: 'bottle', deletedAt: when, category: 'wine', name: 'Margaux', producer: 'Château', quantity: 1, isOpened: false },
    ];
    render(<InventoryTrash t={t} />);
    const [box, single, bottle] = screen.getAllByRole('listitem');
    expect(box).toHaveTextContent(/^Cohiba — Robusto.*1 boîte · /);
    expect(single).toHaveTextContent('1 cigare · ');
    expect(within(box).getByRole('button', { name: 'Restaurer la boîte' })).toBeInTheDocument();
    expect(within(single).getByRole('button', { name: 'Restaurer le cigare' })).toBeInTheDocument();
    expect(within(bottle).getByRole('button', { name: 'Restaurer la bouteille' })).toBeInTheDocument();
  });
});

// Review of #828: the cigars' trash headed its sections « Vins » and
// « Bouteilles et cigares ».
describe('InventoryTrash headings follow the page', () => {
  it('the cigars page says « Cigares » and « Boîtes et cigares »', () => {
    data.wines = [{ ...product({ id: 'c1', name: 'Robusto', category: 'cigar', items: [] }), deletedAt: when }];
    data.items = [{ id: 'box', productId: 'c2', deletedAt: when, category: 'cigar', name: 'Corona', producer: 'M', quantity: 2, cigarsPerBox: 25, isOpened: false }];
    render(<InventoryTrash t={t} lockedCategories={['cigar']} />);
    expect(screen.getByRole('region', { name: 'Cigares' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cigares' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Boîtes et cigares' })).toBeInTheDocument();
  });

  // Recette v3: with one section only, it had no heading at all.
  it('the cigars page heads its only section « Boîtes et cigares »', () => {
    data.wines = [];
    data.items = [{ id: 'box', productId: 'c2', deletedAt: when, category: 'cigar', name: 'Corona', producer: 'M', quantity: 1, cigarsPerBox: 25, isOpened: false }];
    render(<InventoryTrash t={t} lockedCategories={['cigar']} />);
    expect(screen.getByRole('heading', { name: 'Boîtes et cigares' })).toBeInTheDocument();
  });

  it('the bottles page says « Vins » and « Bouteilles »', () => {
    data.wines = [{ ...product({ id: 'w1', name: 'Cuvée X', items: [] }), deletedAt: when }];
    data.items = [{ id: 'b', productId: 'w2', deletedAt: when, category: 'wine', name: 'Autre', producer: 'D', quantity: 1, isOpened: false }];
    render(<InventoryTrash t={t} lockedCategories={['wine', 'sparkling', 'spirit']} />);
    expect(screen.getByRole('region', { name: 'Vins' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bouteilles' })).toBeInTheDocument();
  });
});

// #962 (owner decision): only an administrator deletes for good or empties
// the trash; the others restore, and are told the trash empties itself.
describe('InventoryTrash permanent deletion (#962)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.isAdmin = true;
    session.reachable = true;
    data.wines = [{ ...product({ id: 'w1', producer: 'Domaine A', name: 'Cuvée X', items: [unit({ quantity: 6, deletedAt: when })] }), deletedAt: when }];
    data.items = [
      { id: 'boxes', productId: 'c2', deletedAt: when, category: 'cigar', name: 'Corona', producer: 'M', quantity: 2, cigarsPerBox: 25, isOpened: false },
      { id: 'one', productId: 'w6', deletedAt: when, category: 'wine', name: 'Seule', producer: 'D', quantity: 1, isOpened: false },
    ];
  });

  it('a member who is not an administrator only restores, and reads that the trash empties itself', () => {
    session.isAdmin = false;
    render(<InventoryTrash t={t} />);
    expect(screen.queryByRole('button', { name: /Supprimer définitivement/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vider la corbeille' })).toBeNull();
    expect(screen.getByText(/supprimé définitivement après 7 jours/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Restaurer/ })).toHaveLength(3);
  });

  it('deletes a wine for good after a confirmation naming it, its bottles, and that it cannot be undone', () => {
    render(<InventoryTrash t={t} />);
    const wines = screen.getByTestId('trash-wines');
    fireEvent.click(within(wines).getByRole('button', { name: 'Supprimer définitivement' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Supprimer définitivement Domaine A — Cuvée X (2020) et ses 6 bouteilles ?');
    expect(dialog).toHaveTextContent('irréversible');
    expect(deleteWine).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer définitivement' }));
    expect(deleteWine).toHaveBeenCalledWith('w1', expect.anything());
  });

  it('deletes one line for good after a confirmation giving its count', () => {
    render(<InventoryTrash t={t} />);
    const [, boxes] = screen.getAllByRole('listitem');
    fireEvent.click(within(boxes).getByRole('button', { name: 'Supprimer définitivement' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Supprimer définitivement 2 boîtes (M — Corona) ?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer définitivement' }));
    expect(deleteItem).toHaveBeenCalledWith('boxes', expect.anything());
    expect(deleteWine).not.toHaveBeenCalled();
  });

  it('cancelling deletes nothing', () => {
    render(<InventoryTrash t={t} />);
    const [, boxes] = screen.getAllByRole('listitem');
    fireEvent.click(within(boxes).getByRole('button', { name: 'Supprimer définitivement' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("empties the page's trash after a confirmation giving the count", () => {
    render(<InventoryTrash t={t} lockedCategories={['wine', 'sparkling', 'spirit']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vider la corbeille' }));
    const dialog = screen.getByRole('dialog');
    // The wine and the bottle of this page; the cigars are not on it.
    expect(dialog).toHaveTextContent('Les 2 entrées de cette corbeille seront supprimées définitivement.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vider la corbeille' }));
    expect(emptyTrash).toHaveBeenCalledWith(['wine', 'sparkling', 'spirit'], expect.anything());
  });

  it('offline, the two actions are disabled with the reason and do nothing', () => {
    session.reachable = false;
    render(<InventoryTrash t={t} />);
    const empty = screen.getByRole('button', { name: 'Vider la corbeille' });
    expect(empty).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Disponible au retour de la connexion').length).toBeGreaterThan(0);
    fireEvent.click(empty);
    const [first] = screen.getAllByRole('button', { name: 'Supprimer définitivement' });
    expect(first).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(first);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(emptyTrash).not.toHaveBeenCalled();
    expect(deleteWine).not.toHaveBeenCalled();
  });
});
