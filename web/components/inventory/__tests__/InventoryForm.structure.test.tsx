import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useKnownWine', () => ({ useKnownWine: () => [] }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('@/lib/search/client', () => ({ searchClient: { searchImages: vi.fn(async () => []), saveImageFromUrl: vi.fn() } }));
vi.mock('../ItemImageSection', () => ({ ItemImageSection: () => null }));
vi.mock('../ProductAutocomplete', () => ({ ProductAutocomplete: () => <input aria-label="Nom" /> }));
vi.mock('../ProducerAutocomplete', () => ({ ProducerAutocomplete: () => <input aria-label="Producteur" /> }));

import { InventoryForm } from '../InventoryForm';

// #701: the add form's structure, read out by a screen reader, and its layout.
describe('InventoryForm — headings and layout (#701)', () => {
  const open = () =>
    render(<InventoryForm open defaultCategory="wine" onSubmit={vi.fn()} onClose={() => {}} t={(key, opts) => t(key, opts)} />);

  it('is named by its title alone, an h2, not by the chip and buttons beside it', () => {
    open();
    const dialog = screen.getByRole('dialog');
    const title = within(dialog).getByRole('heading', { level: 2 });
    expect(title).toHaveTextContent(t('inventory.add'));
    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
  });

  it('titles its sections with h3 headings', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { level: 3, name: t('inventory.step1') })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { level: 3, name: t('inventory.step2') })).toBeInTheDocument();
  });

  it('gives the cellar field the whole row, next to no empty cell', () => {
    open();
    const dialog = screen.getByRole('dialog');
    const cellar = within(dialog).getAllByText(t('nav.caves'))[0].closest('[data-slot="base"]');
    expect(cellar?.className).toMatch(/\bsm:col-span-2\b/);
  });

  it('says how to record a wine without a vintage, rather than a label that reads like a control', () => {
    open();
    expect(screen.getByText('Laisser vide si sans millésime')).toBeInTheDocument();
  });
});
