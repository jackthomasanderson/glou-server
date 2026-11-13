import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next, { type i18n as I18n } from 'i18next';
import fr from '../../../public/locales/fr/common.json';
import type { HumidorHistory } from '@/hooks/useHumidor';

// #700: a decimal humidity or temperature reads with a comma in French.
let i18n: I18n;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: unknown) => string)(k, o),
    i18n: { language: 'fr' },
  }),
}));
beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({ lng: 'fr', resources: { fr: { common: fr } }, defaultNS: 'common', interpolation: { escapeValue: false } });
});

const reading = { id: 'r1', cellarId: 'c1', userId: 'u1', humidityPercent: 68.5, temperatureCelsius: 17.5, source: 'manual' as const, recordedAt: '2026-11-01T10:00:00.000Z' };
const history: HumidorHistory = {
  cellar: { id: 'c1', targetHumidityMin: 65, targetHumidityMax: 72 },
  readings: [reading],
  latest: reading,
  drift: 'in_range',
};
vi.mock('@/hooks/useHumidor', () => ({
  useHumidorHistory: () => ({ data: history, isLoading: false }),
  useRecordHumidorReading: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { HumidorPanel } from '../HumidorPanel';

describe('HumidorPanel', () => {
  it('writes decimal readings with a comma in French', () => {
    render(<HumidorPanel cellarId="c1" />);
    expect(screen.getByText(/Dernière lecture : 68,5 %/)).toBeInTheDocument();
    expect(screen.getByText('68,5 % · 17,5°C')).toBeInTheDocument();
  });
});
