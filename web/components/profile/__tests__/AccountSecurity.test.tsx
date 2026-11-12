import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next, { type i18n as I18n } from 'i18next';
import type { PublicUser } from '@/hooks/useAuth';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';

// #777 — the auto-lock description was bolder than its title, and nothing said
// the PIN is optional.
let i18n: I18n;
const translate = (k: string, o?: Record<string, unknown>) =>
  (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(k, o);

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock('@/hooks/useAuth', () => {
  const m = () => ({ mutate: vi.fn(), isPending: false });
  return { useUpdateEmail: m, useUpdateUsername: m, useUpdatePassword: m, useUpdatePreferences: m, useSetPin: m, useRemovePin: m };
});
vi.mock('@/components/profile/TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));
vi.mock('@/components/profile/TrustedDeviceSettings', () => ({ TrustedDeviceSettings: () => null }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: () => null }));
vi.mock('@/components/ui/SingleSelect', () => ({ SingleSelect: () => <div /> }));
vi.mock('@/components/auth/PasswordStrengthMeter', () => ({ PasswordStrengthMeter: () => null }));

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    resources: { en: { common: en }, fr: { common: fr } },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
});

import { AccountSecurity } from '../AccountSecurity';

const user = { id: 'u1', username: 'alex84', email: 'a@example.com', hasPin: false, autoLockDelayMin: null } as unknown as PublicUser;

describe('AccountSecurity auto-lock and PIN rows (#777)', () => {
  it('shows the auto-lock title more prominently than its description', () => {
    render(<AccountSecurity user={user} />);
    expect(screen.getByText('Auto-lock delay', { selector: 'p' }).className).toContain('font-medium');
    expect(screen.getByText('Locks the app after a period of inactivity').className).not.toContain('font-medium');
  });

  it('says the PIN is optional and the password always works', () => {
    render(<AccountSecurity user={user} />);
    expect(screen.getByText(/Optional: unlock with a code.*password, which always works/)).toBeInTheDocument();
  });
});
