import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #862: once name and producer were typed, the form downloaded the first image
// found for "producer name" and set it as the photo without asking (a protein
// supplement for a wine, a ball bearing for a cigar). It is now a suggestion,
// stored only once accepted, searched with the category.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useKnownWine', () => ({ useKnownWine: () => [] }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('@/lib/search/client', () => ({ searchClient: { searchImages: vi.fn(), saveImageFromUrl: vi.fn() } }));
vi.mock('../ImagePicker', () => ({ ImagePickerButton: () => null }));
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

import { searchClient } from '@/lib/search/client';
import { InventoryForm } from '../InventoryForm';
import type { InventoryItem } from '@/lib/inventory/types';

const BOTTLE = { url: 'https://shop.example/cuvee-x.jpg', thumb: 'https://thumbs.example/cuvee-x.jpg', title: 'Domaine Y — Cuvée X 2019' };
const OTHER_BOTTLE = { url: 'https://shop.example/cuvee-x-2.jpg', thumb: 'https://thumbs.example/cuvee-x-2.jpg', title: 'Cuvee X, Domaine Y' };
const BALL_BEARING = { url: 'https://parts.example/zz.jpg', thumb: 'https://thumbs.example/zz.jpg', title: 'SKF 6204-2Z deep groove ball bearing' };

function draw(name = 'Cuvée X', producer = 'Domaine Y') {
  const onSubmit = vi.fn();
  render(<InventoryForm open defaultCategory="wine" onSubmit={onSubmit} onClose={() => {}} t={(key, opts) => t(key, opts)} />);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: name } });
  fireEvent.change(within(dialog).getByLabelText('Producteur'), { target: { value: producer } });
  const submit = () => {
    fireEvent.click(within(dialog).getByTestId('inventory-form-submit'));
    return onSubmit.mock.calls.at(-1)?.[0] as Partial<InventoryItem>;
  };
  return { dialog, submit };
}

const suggestionShown = () => screen.findByRole('button', { name: 'itemImage.suggestion.use' }, { timeout: 3000 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchClient.searchImages).mockResolvedValue([BOTTLE, BALL_BEARING, OTHER_BOTTLE]);
  vi.mocked(searchClient.saveImageFromUrl).mockResolvedValue('/uploads/products/stored.jpg');
});

describe('InventoryForm — photo suggestion (#862)', () => {
  it('searches with the category and shows the photo without attaching it', async () => {
    const { submit } = draw();
    await suggestionShown();
    expect(searchClient.searchImages).toHaveBeenCalledWith('Domaine Y Cuvée X', 'wine');
    expect(screen.getByText('itemImage.suggestion.question')).toBeInTheDocument();
    expect(document.querySelector(`img[src="${BOTTLE.thumb}"]`)).not.toBeNull();
    expect(searchClient.saveImageFromUrl).not.toHaveBeenCalled();
    expect(submit().photoUrl).toBeUndefined();
  });

  it('stores the photo only once accepted, as a chosen photo is stored', async () => {
    const { submit } = draw();
    fireEvent.click(await suggestionShown());
    await waitFor(() => expect(searchClient.saveImageFromUrl).toHaveBeenCalledWith(BOTTLE.url));
    await waitFor(() => expect(submit().photoUrl).toBe('/uploads/products/stored.jpg'));
  });

  it('offers another matching photo, skipping a result about something else', async () => {
    draw();
    await suggestionShown();
    fireEvent.click(screen.getByRole('button', { name: 'itemImage.suggestion.another' }));
    expect(document.querySelector(`img[src="${OTHER_BOTTLE.thumb}"]`)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'itemImage.suggestion.use' }));
    await waitFor(() => expect(searchClient.saveImageFromUrl).toHaveBeenCalledWith(OTHER_BOTTLE.url));
    expect(searchClient.saveImageFromUrl).not.toHaveBeenCalledWith(BALL_BEARING.url);
  });

  it('leaves the photo empty once the suggestion is dismissed', async () => {
    const { submit } = draw();
    await suggestionShown();
    fireEvent.click(screen.getByRole('button', { name: 'itemImage.suggestion.dismiss' }));
    expect(screen.queryByRole('button', { name: 'itemImage.suggestion.use' })).toBeNull();
    expect(searchClient.saveImageFromUrl).not.toHaveBeenCalled();
    expect(submit().photoUrl).toBeUndefined();
  });

  it('suggests nothing when no result is about the item typed', async () => {
    vi.mocked(searchClient.searchImages).mockResolvedValue([BALL_BEARING]);
    const { submit } = draw('ZZ C5 Petit', 'ZZ');
    await waitFor(() => expect(searchClient.searchImages).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('button', { name: 'itemImage.suggestion.use' })).toBeNull();
    expect(submit().photoUrl).toBeUndefined();
  });
});
