import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { descriptionValues } from '@/lib/products/description';
import { product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #471 (FEAT-92 c4, ux-ui.md §10.3): "Modifier" on a wine edits its
// description, once for all its bottles, and says how many.

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

const wine = product({ region: 'Bordeaux', items: [unit({ quantity: 6, purchasePrice: 20 }), unit({ quantity: 3 })] });

const BOTTLE_FIELDS = [
  'Caves', 'Nombre de bouteilles', "Prix d'une bouteille", "Date d'achat", "Lieu d'achat", "Valeur estimée d'une bouteille", 'Taille de bouteille',
];

function draw(onSubmit = vi.fn(), description = true) {
  render(
    <InventoryForm
      open
      initialValues={descriptionValues(wine)}
      descriptionOf={description ? { units: 9, kind: 'bottle' } : undefined}
      onSubmit={onSubmit}
      onClose={() => {}}
      t={(key, options) => t(key, options)}
    />,
  );
  return onSubmit;
}

describe('InventoryForm — a wine\'s description', () => {
  it('says the change applies to its 9 bottles, under "Modifier ce vin"', () => {
    draw();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Modifier ce vin')).toBeInTheDocument();
    expect(within(dialog).getByTestId('description-scope')).toHaveTextContent('Modifie ce vin pour ses 9 bouteilles.');
  });

  it('shows no field of a bottle: no cellar, price, value, size, number nor state', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les compléments' }));
    const dialog = screen.getByRole('dialog');
    for (const label of BOTTLE_FIELDS) expect(within(dialog).queryByLabelText(label)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Bouteille entamée/ })).toBeNull();
    // The reminder is the wine's.
    expect(within(dialog).getByLabelText('Rappel de consommation')).toBeInTheDocument();
  });

  it('(the same labels, on the form of one bottle, do exist)', () => {
    draw(vi.fn(), false);
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les compléments' }));
    const dialog = screen.getByRole('dialog');
    for (const label of BOTTLE_FIELDS) expect(within(dialog).getAllByLabelText(label).length).toBeGreaterThan(0);
    expect(within(dialog).getByRole('button', { name: /Bouteille entamée/ })).toBeInTheDocument();
  });

  it('sends only what changed: the region', () => {
    const onSubmit = draw();
    const region = screen.getByLabelText('Région');
    fireEvent.change(region, { target: { value: 'Médoc' } });
    fireEvent.click(screen.getByTestId('inventory-form-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ region: 'Médoc' }, []);
  });
});
