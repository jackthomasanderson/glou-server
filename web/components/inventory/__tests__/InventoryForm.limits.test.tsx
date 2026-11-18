import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

import { NAME_MAX_LENGTH } from '@shared/product';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useKnownWine', () => ({ useKnownWine: () => [] }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('@/lib/search/client', () => ({ searchClient: { searchImages: vi.fn(async () => []), saveImageFromUrl: vi.fn() } }));
vi.mock('../ItemImageSection', () => ({ ItemImageSection: () => null }));
vi.mock('../ProductAutocomplete', () => ({
  ProductAutocomplete: ({ value, onChange, isInvalid, errorMessage }: { value: string; onChange: (v: string) => void; isInvalid?: boolean; errorMessage?: string }) => (
    <>
      <input aria-label="Nom" value={value} aria-invalid={isInvalid || undefined} onChange={(e) => onChange(e.target.value)} />
      {isInvalid && <span data-testid="name-error">{errorMessage ?? 'required'}</span>}
    </>
  ),
}));
// #961: the Region field reads the cellar's regions (react-query); a plain input here.
vi.mock('../RegionAutocomplete', () => ({
  RegionAutocomplete: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../ProducerAutocomplete', () => ({
  ProducerAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Producteur" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { InventoryForm } from '../InventoryForm';

// #1042: values the API refuses are told on their field, in the form, before any send.
function setup(category: 'wine' | 'spirit' | 'cigar' = 'wine') {
  const onSubmit = vi.fn();
  render(<InventoryForm open defaultCategory={category} onSubmit={onSubmit} onClose={() => {}} t={(key, opts) => t(key, opts)} />);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Cuvée X' } });
  fireEvent.change(within(dialog).getByLabelText('Producteur'), { target: { value: 'Domaine Y' } });
  const submit = () => fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
  return { dialog, onSubmit, submit };
}

describe('InventoryForm — inline limits (#1042)', () => {
  it('refuses a negative price on the field instead of dropping it', () => {
    const { dialog, onSubmit, submit } = setup();
    const price = within(dialog).getByTestId('inventory-unit-price-input').querySelector('input') ?? within(dialog).getByTestId('inventory-unit-price-input') as HTMLInputElement;
    fireEvent.change(price, { target: { value: '-5' } });
    expect((price as HTMLInputElement).value).toBe('-5');
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByText('inventory.validation.atLeast')).toBeInTheDocument();
    fireEvent.change(price, { target: { value: '5' } });
    expect(price).not.toHaveAttribute('aria-invalid', 'true');
    submit();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ purchasePrice: 5 });
  });

  it('flags a lone minus in the price instead of saving no price silently', () => {
    const { dialog, onSubmit, submit } = setup();
    const price = (within(dialog).getByTestId('inventory-unit-price-input').querySelector('input') ?? within(dialog).getByTestId('inventory-unit-price-input')) as HTMLInputElement;
    fireEvent.change(price, { target: { value: '-' } });
    expect(price.value).toBe('-');
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(price).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses an alcohol degree of 150 on the field', () => {
    const { dialog, onSubmit, submit } = setup();
    const abv = within(dialog).getByLabelText("Degré d'alcool (%)") as HTMLInputElement;
    fireEvent.change(abv, { target: { value: '150' } });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(abv).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByText('inventory.validation.range')).toBeInTheDocument();
    fireEvent.change(abv, { target: { value: '13,5' } });
    submit();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ alcoholDegree: 13.5 });
  });

  it.each(['-3', '99999'])('says why a quantity of %s is refused', (value) => {
    const { dialog, onSubmit, submit } = setup();
    const quantity = within(dialog).getByTestId('inventory-quantity-input').querySelector('input') ?? within(dialog).getByTestId('inventory-quantity-input') as HTMLInputElement;
    fireEvent.change(quantity, { target: { value } });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(quantity).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getAllByText(/inventory\.validation\.(range|bottleCount)/).length).toBeGreaterThan(0);
  });

  it('tells a name longer than the API takes, on the Name field', () => {
    const { dialog, onSubmit, submit } = setup();
    const name = within(dialog).getByLabelText('Nom');
    fireEvent.change(name, { target: { value: 'x'.repeat(NAME_MAX_LENGTH + 1) } });
    expect(within(dialog).getByTestId('name-error')).toHaveTextContent('200 caractères au maximum');
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'x'.repeat(NAME_MAX_LENGTH) } });
    expect(within(dialog).queryByTestId('name-error')).toBeNull();
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
