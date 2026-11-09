import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// #587: a spirit found during a count is asked its ABV, optional — left
// empty, it stays unknown (never an invented 0 %); other categories have none.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
const record = vi.fn();
vi.mock('@/hooks/useInventoryCount', () => ({
  useRecordFoundItem: () => ({ mutateAsync: record, isPending: false }),
}));

import { RecordFoundItemModal } from '../RecordFoundItemModal';

const ABV = 'inventory.fields.alcoholDegree';

async function openAs(category?: string) {
  render(<RecordFoundItemModal sessionId="s1" isOpen onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/inventoryCount.session.foundNew.nameLabel/), { target: { value: 'Lagavulin 16' } });
  if (category) {
    fireEvent.click(within(dialog).getByRole('button', { name: /inventoryCount.session.foundNew.categoryLabel/ }));
    fireEvent.click((await screen.findAllByRole('option')).find((option) => option.textContent === `categories.${category}`) as HTMLElement);
  }
  return dialog;
}

const submit = async (dialog: HTMLElement) => {
  fireEvent.click(within(dialog).getByRole('button', { name: 'actions.add' }));
  await vi.waitFor(() => expect(record).toHaveBeenCalled());
  return record.mock.calls[0][0] as Record<string, unknown>;
};

beforeEach(() => {
  vi.clearAllMocks();
  record.mockResolvedValue({ entryId: 'f1' });
});

describe('RecordFoundItemModal — the ABV of a spirit (#587)', () => {
  it('asks no ABV for a wine', async () => {
    const dialog = await openAs();
    expect(within(dialog).queryByLabelText(ABV)).toBeNull();
    expect(await submit(dialog)).not.toHaveProperty('alcoholDegree');
  });

  it('sends the ABV typed for a spirit, with a comma', async () => {
    const dialog = await openAs('spirit');
    fireEvent.change(within(dialog).getByLabelText(ABV), { target: { value: '43,5' } });
    expect(await submit(dialog)).toMatchObject({ name: 'Lagavulin 16', category: 'spirit', alcoholDegree: 43.5 });
  });

  it('leaves the ABV of a spirit unknown when left empty', async () => {
    const dialog = await openAs('spirit');
    expect(within(dialog).getByLabelText(ABV)).toBeInTheDocument();
    expect(await submit(dialog)).not.toHaveProperty('alcoholDegree');
  });
});
