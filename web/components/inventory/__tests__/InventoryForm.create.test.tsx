import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { todayLocalIso } from '@/lib/format';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #471 (FEAT-92 c1-c2, ux-ui.md §10.4.1, lot E1): the add form stores N
// identical bottles at once — number, size, cellar, price of ONE bottle and
// purchase day together — and no longer offers "owned / reference".

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
// ResponsiveModal reads window.matchMedia (useIsMobile), absent from jsdom.
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('@/lib/search/client', () => ({ searchClient: { searchImages: vi.fn(async () => []), saveImageFromUrl: vi.fn() } }));
vi.mock('../ItemImageSection', () => ({ ItemImageSection: () => null }));
vi.mock('../ProductAutocomplete', () => ({
  ProductAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Nom" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../ProducerAutocomplete', () => ({
  ProducerAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Producteur" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { InventoryForm } from '../InventoryForm';
import type { InventoryCategory, InventoryItem } from '@/lib/inventory/types';

function draw(options: { defaultCategory?: InventoryCategory; initialValues?: Partial<InventoryItem> } = {}) {
  const onSubmit = vi.fn();
  render(
    <InventoryForm
      open
      defaultCategory={options.defaultCategory}
      initialValues={options.initialValues}
      onSubmit={onSubmit}
      onClose={() => {}}
      t={(key, opts) => t(key, opts)}
    />,
  );
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Cuvée X' } });
  fireEvent.change(within(dialog).getByLabelText('Producteur'), { target: { value: 'Domaine Y' } });
  return { dialog, onSubmit, sent: () => onSubmit.mock.calls.at(-1)?.[0] as Partial<InventoryItem> };
}

const type = (dialog: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });

describe('InventoryForm — adding bottles', () => {
  it('shows the number of bottles (1), their size, the price of one bottle and the purchase day (today) without unfolding anything', () => {
    const { dialog } = draw();
    expect(within(dialog).getByLabelText('Nombre de bouteilles')).toHaveValue(1);
    expect(within(dialog).getByLabelText('Taille de bouteille')).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Prix d'une bouteille")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Date d'achat")).toHaveValue(todayLocalIso());
  });

  it('sends 6 bottles at 20 € each, bought today, as one entry (FEAT-92 c1)', () => {
    const { dialog, onSubmit, sent } = draw();
    type(dialog, 'Nombre de bouteilles', '6');
    type(dialog, "Prix d'une bouteille", '20');
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(sent()).toMatchObject({ quantity: 6, purchasePrice: 20, purchasedAt: todayLocalIso() });
  });

  it('sends the purchase day typed, as YYYY-MM-DD, and none once emptied (D6)', () => {
    const { dialog, sent } = draw();
    type(dialog, "Date d'achat", '2026-01-15');
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(sent().purchasedAt).toBe('2026-01-15');

    type(dialog, "Date d'achat", '');
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(sent().purchasedAt).toBeNull();
  });

  it('refuses no bottle at all', () => {
    const { dialog, onSubmit } = draw();
    type(dialog, 'Nombre de bouteilles', '');
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('no longer offers "En cave" / "Référence" (FEAT-87 replaced by FEAT-101)', () => {
    const { dialog, sent } = draw();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Afficher les compléments' }));
    expect(within(dialog).queryByRole('button', { name: /En cave$/ })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Référence$/ })).toBeNull();
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(sent()).not.toHaveProperty('isOwned');
  });

  it('opens only a single bottle: several bottles are stored full', () => {
    const { dialog, sent } = draw();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Afficher les compléments' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Bouteille entamée/ }));
    type(dialog, 'Nombre de bouteilles', '6');
    expect(within(dialog).queryByRole('button', { name: /Bouteille entamée/ })).toBeNull();
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(sent()).toMatchObject({ quantity: 6, isOpened: false });
  });

  it('prefills the number and the day on a form opened with values (scan), keeping theirs', () => {
    const { dialog } = draw({ initialValues: { category: 'wine', name: 'Cuvée X', producer: 'Domaine Y', bottleSize: '150cl' } });
    expect(within(dialog).getByLabelText('Nombre de bouteilles')).toHaveValue(1);
    expect(within(dialog).getByLabelText("Date d'achat")).toHaveValue(todayLocalIso());
    expect(within(dialog).getByLabelText('Taille de bouteille')).toHaveValue('150cl');
  });

  it('leaves cigars to their own number (FEAT-95)', () => {
    const { dialog } = draw({ defaultCategory: 'cigar' });
    expect(within(dialog).queryByLabelText('Nombre de bouteilles')).toBeNull();
    expect(within(dialog).queryByLabelText("Prix d'une bouteille")).toBeNull();
  });
});
