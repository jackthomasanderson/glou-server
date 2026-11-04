import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

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

// Recette v2 (#471, lot RD point 1): "202" refused, then corrected to 2020,
// kept its message and blocked the save until a reload.
describe('InventoryForm — vintage corrected after an error', () => {
  it('clears the message as soon as the vintage is valid, and saves', () => {
    const onSubmit = vi.fn();
    render(<InventoryForm open defaultCategory="wine" onSubmit={onSubmit} onClose={() => {}} t={(key, opts) => t(key, opts)} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Cuvée X' } });
    fireEvent.change(within(dialog).getByLabelText('Producteur'), { target: { value: 'Domaine Y' } });
    const vintage = within(dialog).getByLabelText('Millésime') as HTMLInputElement;

    fireEvent.input(vintage, { target: { value: '202' } });
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(vintage).toHaveAttribute('aria-invalid', 'true');
    // The field's own message (react-i18next answers keys here).
    expect(within(dialog).getByText('inventory.validation.range')).toBeInTheDocument();

    // Typed in a browser: input events only, "change" waits for the blur.
    fireEvent.input(vintage, { target: { value: '2020' } });
    expect(vintage).not.toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).queryByText('inventory.validation.range')).toBeNull();
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ vintage: 2020 });
  });
});
