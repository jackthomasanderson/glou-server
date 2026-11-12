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

import { ShareForm, computeExpiresAt } from '../ShareForm';

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

    // #911: a read/write link asks for the account password before it is created.
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();
    expect(screen.getByText(/reste valable même après votre déconnexion/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Votre mot de passe'), { target: { value: 'secret' } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ cellarIds: ['garage'], writeCellarIds: ['garage'], password: 'secret' });
  });

  it('a read-only link stays one click: no password asked or sent (#911)', async () => {
    const onSubmit = vi.fn<(values: ShareFormValues) => Promise<void>>(async () => {});
    render(<ShareForm onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garage' }));
    expect(screen.queryByLabelText('Votre mot de passe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('password');
  });

  it('turning write access off again drops the password (#911)', async () => {
    const onSubmit = vi.fn<(values: ShareFormValues) => Promise<void>>(async () => {});
    render(<ShareForm onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garage' }));
    const toggle = screen.getByRole('switch', { name: 'Garage Autoriser à ouvrir, boire ou fumer' });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('Votre mot de passe'), { target: { value: 'secret' } });
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('Votre mot de passe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('password');
  });

  it('the Partages section no longer says the view is read-only only (FR/EN)', () => {
    expect(fr.shares.subtitle).not.toMatch(/lecture seule/i);
    expect(fr.shares.subtitle).toMatch(/ouvrir, boire ou fumer/);
    expect(en.shares.subtitle).not.toMatch(/read-only/i);
    expect(en.shares.subtitle).toMatch(/open, drink or smoke/);
    expect(en.shares.fields.allowWrite).toBe('Allow opening, drinking or smoking');
  });
});

// #598: a chosen date was read as midnight UTC (2 a.m. in Paris in summer), so
// the link died at the very start of that day, and at once when today was chosen.
describe('computeExpiresAt — custom date (#598)', () => {
  const withTimeZone = (tz: string, run: () => void) => {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try { run(); } finally { process.env.TZ = previous; }
  };

  it('lasts until the end of the chosen local day, outside UTC', () => {
    withTimeZone('Europe/Paris', () => {
      expect(computeExpiresAt('custom', '2026-07-14')).toBe('2026-07-14T21:59:59.999Z');
      // The night summer time ends: the day lasts 25 hours, and the link all of them.
      expect(computeExpiresAt('custom', '2026-10-25')).toBe('2026-10-25T22:59:59.999Z');
    });
    withTimeZone('America/New_York', () => {
      expect(computeExpiresAt('custom', '2026-07-14')).toBe('2026-07-15T03:59:59.999Z');
    });
  });

  it('a link created today for today still works for the rest of the day', () => {
    withTimeZone('Europe/Paris', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-10-21T18:30:00Z')); // 20:30 in Paris
        const expiresAt = computeExpiresAt('custom', '2026-10-21');
        expect(expiresAt).toBe('2026-10-21T21:59:59.999Z');
        expect(new Date(expiresAt!).getTime()).toBeGreaterThan(Date.now());
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('an empty custom date gives no expiry date to send', () => {
    expect(computeExpiresAt('custom', '')).toBeNull();
  });
});
