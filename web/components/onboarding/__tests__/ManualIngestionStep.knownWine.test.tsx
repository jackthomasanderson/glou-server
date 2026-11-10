import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { product, unit } from '@/lib/products/__tests__/factories';
import type { Product } from '@/lib/products/types';
import type { KnownWineFields } from '@/hooks/useKnownWine';

// #690: the wizard's manual step, with the real add form and a wine the
// household already has (not a unique name, as the e2e spec types): the
// "Vous avez déjà ce vin" proposal adds the bottles to that wine and counts
// them; "C'est un autre vin" creates a new one, told apart.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

/** "Cuvée X 2020": 6 bottles in the garage. */
const cuveeX = product({
  id: 'p1', name: 'Cuvée X', producer: 'Domaine Y', vintage: 2020,
  items: [unit({ id: 'g1', quantity: 6, cellarId: 'garage', purchasePrice: 20, bottleSize: '75cl' })],
});

vi.mock('@/hooks/useKnownWine', () => ({
  useKnownWine: (fields: KnownWineFields, enabled: boolean) =>
    (enabled && fields.name === 'Cuvée X' && fields.producer === 'Domaine Y' && fields.vintage === 2020 ? [cuveeX] : []) as Product[],
}));
const addUnits = vi.fn();
vi.mock('@/hooks/useProducts', () => ({ useAddUnits: () => ({ mutate: addUnits, isPending: false }) }));
const createItem = vi.fn();
vi.mock('@/hooks/useInventory', () => ({ useCreateInventoryItem: () => ({ mutateAsync: createItem, isPending: false }) }));
vi.mock('@/hooks/useCollections', () => ({
  useCollections: () => ({ data: [] }),
  useAddItemsToCollection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }, { id: 'wizard-cellar', name: 'Cave' }] }) }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => t(key, o), i18n: { language: 'fr' } }),
}));
vi.mock('@/lib/search/client', () => ({ searchClient: { searchImages: vi.fn(async () => []), saveImageFromUrl: vi.fn() } }));
vi.mock('@/components/inventory/ItemImageSection', () => ({ ItemImageSection: () => null }));
vi.mock('@/components/inventory/ProductAutocomplete', () => ({
  ProductAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Nom" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('@/components/inventory/ProducerAutocomplete', () => ({
  ProducerAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Producteur" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ManualIngestionStep } from '../steps/ManualIngestionStep';

const onItemAdded = vi.fn();

function typeTheKnownWine() {
  render(<ManualIngestionStep cellarId="wizard-cellar" itemsAdded={0} onItemAdded={onItemAdded} onDone={() => {}} onBack={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter une bouteille' }));
  const dialog = screen.getByRole('dialog');
  const type = (label: string, value: string) => fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  type('Nom', 'Cuvée X');
  type('Producteur', 'Domaine Y');
  type('Millésime', '2020');
  return { dialog, type };
}

beforeEach(() => {
  vi.clearAllMocks();
  createItem.mockResolvedValue({ id: 'new-1', name: 'Cuvée X', producer: 'Domaine Y' });
});

describe('ManualIngestionStep — a wine already known (#690, FEAT-97)', () => {
  it('adds the bottles to the known wine and counts them, without creating a new wine', async () => {
    const { dialog, type } = typeTheKnownWine();
    expect(within(dialog).getByTestId('known-wine-banner')).toHaveTextContent('Vous avez déjà ce vin');

    fireEvent.click(within(dialog).getByTestId('known-wine-add'));
    type('Nombre de bouteilles', '3');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));

    const [{ product: target, input }, { onSuccess }] = addUnits.mock.calls[0] as [
      { product: Product; input: Record<string, unknown> }, { onSuccess: (write: unknown) => void },
    ];
    expect(target.id).toBe('p1');
    expect(input).toMatchObject({ quantity: 3 });
    onSuccess({ data: { id: 'g2' }, changed: [], removedIds: [] });

    await waitFor(() => expect(onItemAdded).toHaveBeenCalledOnce());
    expect(createItem).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"C\'est un autre vin" creates a new wine in the wizard cellar, told apart from the known one', async () => {
    const { dialog } = typeTheKnownWine();
    fireEvent.click(within(dialog).getByRole('button', { name: "C'est un autre vin" }));
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));

    await waitFor(() => expect(onItemAdded).toHaveBeenCalledOnce());
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cuvée X', vintage: 2020, distinctFrom: ['p1'], cellarId: 'wizard-cellar',
    }));
  });
});
