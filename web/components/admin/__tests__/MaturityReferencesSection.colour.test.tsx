import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MaturityReference } from '@/hooks/useAdmin';

// #733: the reference colour is compared with the colour stored on a bottle,
// so the form offers the stored colours (translated) and "any colour" only.

const create = vi.fn();
let refs: MaturityReference[] = [];
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useAdmin', () => ({
  useMaturityReferences: () => ({ data: refs, isLoading: false }),
  useCreateMaturityReference: () => ({ mutate: create, isPending: false }),
  useUpdateMaturityReference: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMaturityReference: () => ({ mutate: vi.fn() }),
  useReorderMaturityReferences: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MaturityReferencesSection } from '../MaturityReferencesSection';

describe('MaturityReferencesSection colour (#733)', () => {
  it('offers only the stored colours, translated, plus "any colour", and saves the code', async () => {
    refs = [];
    render(<MaturityReferencesSection />);
    fireEvent.click(screen.getByRole('button', { name: 'admin.maturityRefs.add' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('textbox', { name: /inventory.fields.color/ })).toBeNull();

    const trigger = within(dialog).getByRole('button', { name: /inventory.fields.color/ });
    expect(trigger).toHaveTextContent('admin.maturityRefs.anyColor');
    fireEvent.click(trigger);
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'admin.maturityRefs.anyColor',
      'inventory.color.red',
      'inventory.color.white',
      'inventory.color.rosé',
      'inventory.color.orange',
    ]);
    fireEvent.click(options[1]);
    await waitFor(() => expect(trigger).toHaveTextContent('inventory.color.red'));

    fireEvent.change(within(dialog).getByRole('textbox', { name: /admin.maturityRefs.fields.name/ }), { target: { value: 'Reds' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'actions.save' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }), expect.anything());
  });

  it('shows a reference colour translated in the criteria', () => {
    refs = [{
      id: 'r1', name: 'Reds', category: 'wine', mode: 'RELATIVE', windowFrom: 5, windowTo: 15, curveShape: 'LINEAR',
      region: 'Bordeaux', color: 'red', producer: null, vintageFrom: null, vintageTo: null, priority: 1, bottleCount: 3,
    } as MaturityReference];
    render(<MaturityReferencesSection />);
    expect(screen.getByText('Bordeaux · inventory.color.red')).toBeInTheDocument();
  });
});
