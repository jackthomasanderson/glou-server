import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #657 (recette v2026.11.3): "Fill in the required fields before saving" is a
// persistent message, but it belongs to the form: it goes away once the form
// is valid, closed or gone, and a new one replaces it instead of piling up.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const { notifyError, closeToast } = vi.hoisted(() => {
  let n = 0;
  return { notifyError: vi.fn(() => `toast-${++n}`), closeToast: vi.fn() };
});
vi.mock('@/lib/toast', () => ({ notifyError }));
vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@heroui/react')>()),
  closeToast,
}));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useKnownWine', () => ({ useKnownWine: () => [] }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/search/client', () => ({ searchClient: { searchImages: vi.fn(async () => []), saveImageFromUrl: vi.fn() } }));
vi.mock('../ItemImageSection', () => ({ ItemImageSection: () => null }));
vi.mock('../ProductAutocomplete', () => ({
  ProductAutocomplete: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Nom" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
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

function draw(open = true) {
  const onSubmit = vi.fn();
  const props = { onSubmit, onClose: () => {}, t: (key: string, opts?: Record<string, unknown>) => t(key, opts) };
  const view = render(<InventoryForm open={open} {...props} />);
  const dialog = screen.getByRole('dialog');
  const submit = () => fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
  const type = (label: string, value: string) => fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  return { ...view, dialog, onSubmit, submit, type, close: () => view.rerender(<InventoryForm open={false} {...props} />) };
}

describe('InventoryForm — the "required fields" message (#657)', () => {
  beforeEach(() => { notifyError.mockClear(); closeToast.mockClear(); });

  it('goes away once the missing fields are filled in, before the save goes through', () => {
    const { submit, type, onSubmit } = draw();
    submit();
    expect(notifyError).toHaveBeenCalledWith('inventory.validation.missingFields', expect.anything());
    const key = notifyError.mock.results[0].value;
    expect(closeToast).not.toHaveBeenCalled();
    type('Nom', 'Cuvée X');
    type('Producteur', 'Domaine Y');
    expect(closeToast).toHaveBeenCalledWith(key);
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('replaces the previous one on a second failed save instead of piling up', () => {
    const { submit } = draw();
    submit();
    const first = notifyError.mock.results[0].value;
    submit();
    expect(closeToast).toHaveBeenCalledWith(first);
    expect(notifyError).toHaveBeenCalledTimes(2);
  });

  it('goes away when the form is closed or leaves the page', () => {
    const closed = draw();
    closed.submit();
    closed.close();
    expect(closeToast).toHaveBeenCalledWith(notifyError.mock.results[0].value);
    closed.unmount();

    closeToast.mockClear();
    const gone = draw();
    gone.submit();
    gone.unmount();
    expect(closeToast).toHaveBeenCalledWith(notifyError.mock.results[1].value);
  });
});
