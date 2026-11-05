import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import fr from '../../../public/locales/fr/common.json';
import en from '../../../public/locales/en/common.json';
import type { ShareFormValues } from '@/lib/shares/types';

// Recette #471 (lot RB, point 7): the switch of a shared cellar named its
// state (« Lecture seule » beside an "off" switch, « Lecture/écriture »
// beside an "on" one) and was read backwards. It now names the action it
// grants, the same words whether on or off; the section says writing is possible.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }], isLoading: false }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [], isLoading: false }) }));

import { ShareForm } from '../ShareForm';

describe('ShareForm — write access of a shared cellar', () => {
  it('labels the switch with the action it grants, whatever its state, and sends it', async () => {
    const onSubmit = vi.fn<(values: ShareFormValues) => Promise<void>>(async () => {});
    render(<ShareForm onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garage' }));

    // Each cellar's switch is named with its cellar (review of #829).
    const toggle = screen.getByRole('switch', { name: 'Garage Autoriser à ouvrir, boire ou fumer' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Autoriser à ouvrir, boire ou fumer')).toBeInTheDocument();
    expect(screen.queryByText('Lecture seule')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByText('Autoriser à ouvrir, boire ou fumer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ cellarIds: ['garage'], writeCellarIds: ['garage'] });
  });

  it('the Partages section no longer says the view is read-only only (FR/EN)', () => {
    expect(fr.shares.subtitle).not.toMatch(/lecture seule/i);
    expect(fr.shares.subtitle).toMatch(/ouvrir, boire ou fumer/);
    expect(en.shares.subtitle).not.toMatch(/read-only/i);
    expect(en.shares.subtitle).toMatch(/open, drink or smoke/);
    expect(en.shares.fields.allowWrite).toBe('Allow opening, drinking or smoking');
  });
});
