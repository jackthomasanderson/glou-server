import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next, { type i18n as I18n } from 'i18next';
import fr from '../../../public/locales/fr/common.json';
import en from '../../../public/locales/en/common.json';
import type { GuestShare } from '@/lib/shares/types';

// #846: a revoked share said when it would have expired, an expired one
// still said "Expires on". #653: the date was always written dd/MM/yyyy,
// whatever the interface language ("03/04/2026" read as March 4 in English).

let i18n: I18n;
let lang = 'en';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: unknown) => string)(k, { lng: lang, ...o }),
    i18n: { language: lang },
  }),
}));

import { ShareCard } from '../ShareCard';

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    resources: { en: { common: en }, fr: { common: fr } },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
});

const share = (over: Partial<GuestShare> = {}): GuestShare => ({
  id: 'sh1', label: 'Weekend', inviteeName: null, expiresAt: null, revokedAt: null,
  hidePrices: true, hideNotes: true, cellarIds: ['c1'], writeCellarIds: [], collectionIds: [],
  userId: 'u1', createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', ...over,
});

const renderCard = (s: GuestShare, language: string) => {
  lang = language;
  return render(<ShareCard share={s} onRevoke={() => {}} />);
};

describe('ShareCard — the date line follows the status (#846) and the language (#653)', () => {
  it('an active share says when it expires, month written out in English', () => {
    renderCard(share({ expiresAt: '2099-04-03T12:00:00.000Z' }), 'en');
    expect(screen.getByText('Expires 3 Apr 2099')).toBeInTheDocument();
    expect(screen.queryByText(/03\/04\/2099/)).toBeNull();
  });

  it('an active share in French', () => {
    renderCard(share({ expiresAt: '2099-04-03T12:00:00.000Z' }), 'fr');
    expect(screen.getByText('Expire le 3 avr. 2099')).toBeInTheDocument();
  });

  it('a revoked share says when it was revoked, not when it would have expired', () => {
    renderCard(share({ expiresAt: '2099-11-12T12:00:00.000Z', revokedAt: '2026-11-05T12:00:00.000Z' }), 'en');
    expect(screen.getByText('Revoked on 5 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Expire/)).toBeNull();
    expect(screen.queryByText(/2099/)).toBeNull();
  });

  it('a revoked share in French', () => {
    renderCard(share({ revokedAt: '2026-11-05T12:00:00.000Z' }), 'fr');
    expect(screen.getByText('Révoqué le 5 nov. 2026')).toBeInTheDocument();
    expect(screen.queryByText('Sans expiration')).toBeNull();
  });

  it('an expired share says "Expired on", in English and in French', () => {
    const { unmount } = renderCard(share({ expiresAt: '2026-04-03T12:00:00.000Z' }), 'en');
    expect(screen.getByText('Expired on 3 Apr 2026')).toBeInTheDocument();
    unmount();
    renderCard(share({ expiresAt: '2026-04-03T12:00:00.000Z' }), 'fr');
    expect(screen.getByText('Expiré le 3 avr. 2026')).toBeInTheDocument();
  });

  it('an active share without expiry still says so', () => {
    renderCard(share(), 'en');
    expect(screen.getByText('No expiration')).toBeInTheDocument();
  });
});
