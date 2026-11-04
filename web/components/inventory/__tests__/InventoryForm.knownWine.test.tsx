import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { todayLocalIso } from '@/lib/format';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { product, unit } from '@/lib/products/__tests__/factories';
import type { Product } from '@/lib/products/types';
import type { KnownWineFields } from '@/hooks/useKnownWine';

// #471 (FEAT-97 c1-c2, c5, ux-ui.md §10.4.1): while a new entry is typed, a
// wine of the same name already known shows "Vous avez déjà ce vin" under
// the name fields; accepting reduces the form to the bottles, "C'est un
// autre vin" goes on with the full entry, remembered apart.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

/** The wines of the same name the lookup answers, for the fields asked. */
let sameName: (fields: KnownWineFields) => Product[] = () => [];
const asked = vi.fn();
vi.mock('@/hooks/useKnownWine', () => ({
  useKnownWine: (fields: KnownWineFields, enabled: boolean) => {
    asked(fields, enabled);
    return enabled ? sameName(fields) : [];
  },
}));
const mutate = vi.fn();
vi.mock('@/hooks/useProducts', () => ({ useAddUnits: () => ({ mutate, isPending: false }) }));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }, { id: 'kitchen', name: 'Cuisine' }] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o), i18n: { language: 'fr' } }),
}));
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

/** "Cuvée X 2020" in cave: 6 bottles in the garage (75 cl, 20 €), 3 in the kitchen. */
const cuveeX = product({
  id: 'p1', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2020,
  items: [
    unit({ id: 'g1', quantity: 6, cellarId: 'garage', purchasePrice: 20, bottleSize: '75cl', purchasedAt: '2026-01-15' }),
    unit({ id: 'g2', quantity: 3, cellarId: 'kitchen', purchasePrice: 18, bottleSize: '75cl', purchasedAt: '2025-01-15', createdAt: '2025-01-15T09:00:00.000Z' }),
  ],
});

function draw() {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const onJoined = vi.fn();
  render(<InventoryForm open onSubmit={onSubmit} onClose={onClose} onJoined={onJoined} t={(key, o) => t(key, o)} />);
  const dialog = screen.getByRole('dialog');
  const type = (label: string, value: string) => fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  return { dialog, type, onSubmit, onClose, onJoined };
}

beforeEach(() => {
  vi.clearAllMocks();
  // c1/c3: the same category, producer, name and vintage only.
  sameName = (fields) => (fields.name === 'Cuvée X' && fields.producer === 'Domaine Y' && fields.vintage === 2020 ? [cuveeX] : []);
});

describe('InventoryForm — "Vous avez déjà ce vin" (FEAT-97)', () => {
  it('c1: shows the wine known, its stock and cellars, once producer, name and vintage match', () => {
    const { dialog, type } = draw();
    type('Nom', 'Cuvée X');
    type('Producteur', 'Domaine Y');
    expect(within(dialog).queryByTestId('known-wine-banner')).toBeNull();

    type('Millésime', '2020');

    const banner = within(dialog).getByTestId('known-wine-banner');
    expect(banner).toHaveTextContent('Vous avez déjà ce vin');
    expect(banner).toHaveTextContent('Domaine Y · Cuvée X 2020');
    expect(within(banner).getByTestId('known-wine-stock')).toHaveTextContent('9 bouteilles en cave · Garage : 6, Cuisine : 3');
    expect(asked).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'wine', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2020 }), true);
  });

  it('c3: proposes nothing for the same wine of another vintage', () => {
    const { dialog, type } = draw();
    type('Nom', 'Cuvée X');
    type('Producteur', 'Domaine Y');
    type('Millésime', '2019');
    expect(within(dialog).queryByTestId('known-wine-banner')).toBeNull();
  });

  it('c2: accepting reduces the form to the bottles, size pre-filled, and adds them to the wine', () => {
    const { dialog, type, onJoined, onClose, onSubmit } = draw();
    type('Nom', 'Cuvée X');
    type('Producteur', 'Domaine Y');
    type('Millésime', '2020');
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));

    // Only what tells the bottles apart: no name, no region.
    expect(within(dialog).queryByLabelText('Nom')).toBeNull();
    expect(within(dialog).queryByLabelText('Région')).toBeNull();
    expect(within(dialog).getByLabelText('Taille de bouteille')).toHaveValue('75cl');
    expect(within(dialog).getByLabelText("Date d'achat")).toHaveValue(todayLocalIso());
    type('Nombre de bouteilles', '3');
    type("Prix d'une bouteille", '25');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));

    const [{ product: target, input }, { onSuccess }] = mutate.mock.calls[0] as [
      { product: Product; input: Record<string, unknown> }, { onSuccess: (write: unknown) => void },
    ];
    expect(target.id).toBe('p1');
    expect(input).toEqual({ quantity: 3, cellarId: 'garage', purchasePrice: 25, bottleSize: '75cl', purchasedAt: todayLocalIso() });
    onSuccess({ data: { id: 'g3' }, changed: [], removedIds: [] });
    expect(onJoined).toHaveBeenCalledWith({ data: { id: 'g3' }, changed: [], removedIds: [] }, cuveeX);
    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps what was typed in the reduced form, and comes back to the full entry on "Retour à la saisie"', () => {
    const { dialog, type } = draw();
    type('Nom', 'Cuvée X');
    type('Producteur', 'Domaine Y');
    type('Millésime', '2020');
    type('Nombre de bouteilles', '2');
    type("Date d'achat", '2026-06-10');
    fireEvent.click(within(dialog).getByTestId('known-wine-add'));

    expect(within(dialog).getByLabelText('Nombre de bouteilles')).toHaveValue(2);
    expect(within(dialog).getByLabelText("Date d'achat")).toHaveValue('2026-06-10');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retour à la saisie' }));
    expect(within(dialog).getByLabelText('Nom')).toHaveValue('Cuvée X');
  });

  it('c5: "C\'est un autre vin" hides the proposal and sends the wine to tell apart with the full entry', () => {
    const { dialog, type, onSubmit } = draw();
    type('Nom', 'Cuvée X');
    type('Producteur', 'Domaine Y');
    type('Millésime', '2020');
    fireEvent.click(within(dialog).getByRole('button', { name: "C'est un autre vin" }));

    expect(within(dialog).queryByTestId('known-wine-banner')).toBeNull();
    expect(within(dialog).getByTestId('known-wine-distinct-noted')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Cuvée X', vintage: 2020, distinctFrom: ['p1'] });
  });

  it('sends no wine to tell apart once the name typed is another one', () => {
    const { dialog, type, onSubmit } = draw();
    type('Nom', 'Cuvée X');
    type('Producteur', 'Domaine Y');
    type('Millésime', '2020');
    fireEvent.click(within(dialog).getByRole('button', { name: "C'est un autre vin" }));
    type('Millésime', '2021');
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('distinctFrom');
  });

  it('ignoring the proposal blocks nothing: the entry is saved as a new wine', () => {
    const { dialog, type, onSubmit } = draw();
    type('Nom', 'Cuvée X');
    type('Producteur', 'Domaine Y');
    type('Millésime', '2020');
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('distinctFrom');
  });

  it('never looks a wine up when editing one', () => {
    render(
      <InventoryForm open initialValues={{ id: 'b1', category: 'wine', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2020 }}
        onSubmit={vi.fn()} onClose={vi.fn()} t={(key, o) => t(key, o)} />,
    );
    expect(screen.queryByTestId('known-wine-banner')).toBeNull();
    expect(asked).toHaveBeenLastCalledWith(expect.anything(), false);
  });
});
