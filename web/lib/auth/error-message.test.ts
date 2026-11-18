import { describe, it, expect, beforeAll } from 'vitest';
import i18next, { type i18n as I18n } from 'i18next';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';
import { ApiError } from '../api';
import { NetworkError } from '../network-error';
import { authErrorMessage, isRateLimited, loadErrorMessage, rateLimitedNotice } from './error-message';

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
    expect(authErrorMessage(t, new NetworkError(new TypeError('Failed to fetch')))).toBe(unreachable);
    expect(authErrorMessage(t, new DOMException('The operation timed out.', 'TimeoutError'))).toBe(unreachable);
    expect(authErrorMessage(t, new ApiError('NETWORK_ERROR', 502), 'forgotPassword.errors')).toBe(unreachable);
  });

  it('a TypeError from our own code is not mistaken for an unreachable server', async () => {
    await i18n.changeLanguage('en');
    expect(authErrorMessage(t, new TypeError("Cannot read properties of undefined (reading 'ok')")))
      .toBe('An unexpected error occurred.');
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

  // #467: a database restart is said as such, not as "unexpected error" or a wrong password.
  it('the server answers 503: temporarily unavailable, try again in a moment', async () => {
    await i18n.changeLanguage('en');
    expect(authErrorMessage(t, new ApiError('DATABASE_UNAVAILABLE', 503)))
      .toBe('The server is temporarily unavailable. Your data is safe: try again in a moment.');
    await i18n.changeLanguage('fr');
    expect(authErrorMessage(t, new ApiError('DATABASE_UNAVAILABLE', 503), 'forgotPassword.errors'))
      .toBe('Le serveur est momentanément indisponible. Vos données sont intactes : réessayez dans un instant.');
  });
});

// #1039: a throttled request is "wait", never "check your connection".
describe('rate-limited requests', () => {
  it('recognises a 429 by status or code, and nothing else', () => {
    expect(isRateLimited(new ApiError('TOO_MANY_REQUESTS', 429))).toBe(true);
    expect(isRateLimited(new ApiError('HTTP 429', 429))).toBe(true);
    expect(isRateLimited(new ApiError('HTTP 500', 500))).toBe(false);
    expect(isRateLimited(new NetworkError(new Error('x')))).toBe(false);
  });

  it('says the wait in seconds up to 90 s, then in minutes, in both languages', async () => {
    const err = (s?: number) => new ApiError('TOO_MANY_REQUESTS', 429, s);
    await i18n.changeLanguage('en');
    expect(loadErrorMessage(t, err(1), 'x')).toBe('Too many requests in a short time. Try again in 1 second.');
    expect(loadErrorMessage(t, err(45), 'x')).toBe('Too many requests in a short time. Try again in 45 seconds.');
    expect(loadErrorMessage(t, err(91), 'x')).toBe('Too many requests in a short time. Try again in 2 minutes.');
    await i18n.changeLanguage('fr');
    expect(loadErrorMessage(t, err(45), 'x')).toBe('Trop de requêtes en peu de temps. Réessayez dans 45 secondes.');
    expect(loadErrorMessage(t, err(600), 'x')).toBe('Trop de requêtes en peu de temps. Réessayez dans 10 minutes.');
  });

  it('without a Retry-After, says "in a moment" rather than guessing', async () => {
    await i18n.changeLanguage('en');
    expect(rateLimitedNotice(new ApiError('TOO_MANY_REQUESTS', 429))).toEqual({ key: 'status.rateLimited' });
    expect(loadErrorMessage(t, new ApiError('TOO_MANY_REQUESTS', 429), 'x')).toBe('Too many requests in a short time. Try again in a moment.');
  });

  it('leaves other failures to the screen own wording', () => {
    expect(loadErrorMessage(t, new ApiError('HTTP 500', 500), 'fallback')).toBe('fallback');
  });
});
