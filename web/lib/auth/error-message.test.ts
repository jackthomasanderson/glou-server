import { describe, it, expect, beforeAll } from 'vitest';
import i18next, { type i18n as I18n } from 'i18next';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';
import { ApiError } from '../api';
import { authErrorMessage } from './error-message';

// #640 / #652 / #582: auth failures read as sentences in the member's language.

let i18n: I18n;
const t = (k: string, o?: Record<string, unknown>) =>
  (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(k, o);

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    resources: { en: { common: en }, fr: { common: fr } },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
});

describe('authErrorMessage', () => {
  it('too many attempts: says how many minutes to wait, rounded up (#640)', async () => {
    await i18n.changeLanguage('en');
    expect(authErrorMessage(t, new ApiError('TOO_MANY_REQUESTS', 429, 14 * 60 + 1)))
      .toBe('Too many attempts. Wait 15 minutes before trying again.');
    expect(authErrorMessage(t, new ApiError('TOO_MANY_REQUESTS', 429, 30)))
      .toBe('Too many attempts. Wait 1 minute before trying again.');
    await i18n.changeLanguage('fr');
    expect(authErrorMessage(t, new ApiError('TOO_MANY_REQUESTS', 429, 600)))
      .toBe('Trop de tentatives. Patientez 10 minutes avant de réessayer.');
  });

  it('too many attempts without a known wait: the full window', async () => {
    await i18n.changeLanguage('en');
    expect(authErrorMessage(t, new Error('TOO_MANY_REQUESTS'), 'resetPassword.errors'))
      .toBe('Too many attempts. Wait 15 minutes before trying again.');
  });

  it('no answer from the server: says it cannot be reached', async () => {
    await i18n.changeLanguage('en');
    const unreachable = 'Cannot reach the server. Check your connection and try again.';
    expect(authErrorMessage(t, new TypeError('Failed to fetch'))).toBe(unreachable);
    expect(authErrorMessage(t, new ApiError('NETWORK_ERROR', 502), 'forgotPassword.errors')).toBe(unreachable);
  });

  it('a known code is translated, never shown raw (#652)', async () => {
    await i18n.changeLanguage('fr');
    expect(authErrorMessage(t, new Error('INVALID_TOTP_CODE'))).toBe('Code de vérification incorrect.');
    expect(authErrorMessage(t, new Error('INVALID_OR_EXPIRED_TOKEN'), 'resetPassword.errors'))
      .toBe('Ce lien est invalide ou a expiré. Faites une nouvelle demande.');
  });

  it("an unknown code falls back to the screen's generic message", async () => {
    await i18n.changeLanguage('en');
    expect(authErrorMessage(t, new Error('2FA_SECRET_NOT_GENERATED'))).toBe('An unexpected error occurred.');
    expect(authErrorMessage(t, new Error('SOMETHING'), 'forgotPassword.errors')).toBe('An error occurred. Please try again.');
  });
});
