import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next, { type i18n as I18n } from 'i18next';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';
import type { ConfigHistoryEntry } from '@/lib/config/client';
import { HISTORY_FIELDS, HISTORY_SECTIONS } from '../config/system/configHistoryFields';

// #760: each history entry is a translated sentence per changed setting,
// old → new, secrets never shown; entries from before #760 still read well.

let i18n: I18n;
let entries: ConfigHistoryEntry[] = [];
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: unknown) => string)(k, o),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useAdmin', () => ({
  CONFIG_HISTORY_KEY: ['config-history'],
  SYSTEM_CONFIG_KEY: ['config'],
  useConfigHistory: () => ({ data: entries, isPending: false, isError: false }),
}));

import { ConfigHistoryCard } from '../config/system/ConfigHistoryCard';

const entry = (fieldName: string, before: object | null, after: object | null, id = 1): ConfigHistoryEntry => ({
  id,
  fieldName,
  maskedOldVal: before === null ? null : JSON.stringify(before),
  maskedNewVal: after === null ? null : JSON.stringify(after),
  createdAt: '2026-11-08T10:00:00.000Z',
  user: { username: 'alice' },
});

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { common: en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
});

describe('ConfigHistoryCard (#760)', () => {
  it('every setting and section of the table has a label in both languages', () => {
    for (const lang of [en, fr]) {
      const h = lang.adminConfig.history as unknown as { fields: Record<string, string>; sections: Record<string, string> };
      for (const field of Object.keys(HISTORY_FIELDS)) expect(h.fields[field], field).toBeTruthy();
      for (const section of HISTORY_SECTIONS) expect(h.sections[section], section).toBeTruthy();
    }
  });

  it('says what changed, from what to what, with labels and readable values', () => {
    entries = [
      entry('backup', { backupHourUtc: 3, backupRetentionDays: 7 }, { backupHourUtc: 4, backupRetentionDays: 14 }, 1),
      entry('registration', { registrationOpen: false }, { registrationOpen: true }, 2),
      entry('network', { accessMode: 'direct', publicUrl: 'https://a.example' }, { accessMode: 'proxy', publicUrl: null }, 3),
    ];
    render(<ConfigHistoryCard />);
    expect(screen.getByText('Backups')).toBeInTheDocument();
    expect(screen.getByText('Backup time: 03:00 UTC → 04:00 UTC')).toBeInTheDocument();
    expect(screen.getByText('Backup retention: 7 days → 14 days')).toBeInTheDocument();
    expect(screen.getByText('New account sign-up: off → on')).toBeInTheDocument();
    expect(screen.getByText('Access mode: direct → behind a reverse proxy')).toBeInTheDocument();
    expect(screen.getByText('Public URL: removed')).toBeInTheDocument();
    expect(screen.getAllByText('By alice')).toHaveLength(3);
    expect(screen.queryByText(/registrationOpen|backupHourUtc|\{/)).toBeNull();
  });

  it('never shows a secret: only set, changed or removed', () => {
    entries = [
      entry('smtp', { smtpPassEnc: null }, { smtpPassEnc: '••••••••' }, 1),
      entry('smtp', { smtpPassEnc: '••••••••' }, { smtpPassEnc: '••••••••' }, 2),
      entry('gotify', { gotifyTokenEnc: '••••••••' }, { gotifyTokenEnc: null }, 3),
    ];
    render(<ConfigHistoryCard />);
    expect(screen.getByText('SMTP password: set')).toBeInTheDocument();
    expect(screen.getByText('SMTP password: changed')).toBeInTheDocument();
    expect(screen.getByText('Gotify token: removed')).toBeInTheDocument();
    expect(screen.queryByText(/••••/)).toBeNull();
  });

  it('shows an entry written before #760 (whole form, no previous value) without raw JSON', () => {
    entries = [
      entry('gotify', null, { gotifyEnabled: true, gotifyUrl: 'https://g.example', gotifyTokenEnc: '••••••••' }, 1),
      entry('integrations', null, {}, 2),
      { ...entry('smtp', null, null, 3), maskedNewVal: 'not json' },
    ];
    render(<ConfigHistoryCard />);
    expect(screen.getByText('Gotify notifications: on')).toBeInTheDocument();
    expect(screen.getByText('Gotify URL: https://g.example')).toBeInTheDocument();
    expect(screen.getByText('Gotify token: saved, not shown')).toBeInTheDocument();
    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getAllByText('Saved, no details recorded.')).toHaveLength(2);
    expect(screen.queryByText(/••••|\{/)).toBeNull();
  });

  it('tolerates a setting or section it does not know, and never shows an unknown secret', () => {
    entries = [entry('futureSection', { someNewSetting: 1, newKeyEnc: null }, { someNewSetting: 2, newKeyEnc: '••••••••' })];
    render(<ConfigHistoryCard />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Another setting: 1 → 2')).toBeInTheDocument();
    expect(screen.getByText('Another setting: set')).toBeInTheDocument();
    expect(screen.queryByText(/someNewSetting|newKeyEnc|••••/)).toBeNull();
  });
});
