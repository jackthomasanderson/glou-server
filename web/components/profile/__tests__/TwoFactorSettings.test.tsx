import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import type { PublicUser } from '@/hooks/useAuth';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';

// #576 — the API never sent isTwoFactorEnabled, so the panel always read
// undefined: it said "Disabled" and offered "Enable" with 2FA on, and the
// "Disable" button never appeared.

// Real translations, so a raw code (#652) cannot pass for a message.
let i18n: I18n;
const translate = (k: string, o?: Record<string, unknown>) =>
  (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(k, o);
const generate = vi.fn();
const turnOn = vi.fn();
const turnOff = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ refetch: vi.fn() }),
  useGenerate2fa: () => ({ mutate: generate, isPending: false }),
  useTurnOn2fa: () => ({ mutate: turnOn, isPending: false }),
  useTurnOff2fa: () => ({ mutate: turnOff, isPending: false }),
}));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>{children}</button>
  ),
  // Forwards the keyboard attributes the tests check.
  Input: ({ label, type, value, onValueChange, inputMode, autoComplete, pattern, maxLength }: {
    label?: string; type?: string; value?: string; onValueChange?: (v: string) => void;
    inputMode?: 'text' | 'numeric'; autoComplete?: string; pattern?: string; maxLength?: number;
  }) => (
    <input
      aria-label={label}
      type={type}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      inputMode={inputMode}
      autoComplete={autoComplete}
      pattern={pattern}
      maxLength={maxLength}
    />
  ),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Divider: () => <hr />,
  CircularProgress: () => <div />,
}));

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    resources: { en: { common: en }, fr: { common: fr } },
    defaultNS: 'common',
    interpolation: { escapeValue: false },
  });
});

import { TwoFactorSettings } from '../TwoFactorSettings';

function makeUser(isTwoFactorEnabled: boolean): PublicUser {
  return {
    id: 'u1',
    username: 'alice',
    email: 'alice@example.com',
    avatarUrl: null,
    appName: null,
    appSlogan: null,
    displayName: null,
    theme: 'SYSTEM',
    language: 'EN',
    tempUnit: 'CELSIUS',
    accentColor: '#6366f1',
    dateFormat: 'SYSTEM',
    expertMode: false,
    isAdmin: false,
    isTwoFactorEnabled,
    createdAt: '2026-01-01T00:00:00.000Z',
    deletionRequestedAt: null,
    hasPin: false,
    autoLockDelayMin: null,
    onboardingCompletedAt: null,
    mustChangePassword: false,
  };
}

describe('TwoFactorSettings follows the account 2FA state (#576)', () => {
  it('shows "disabled" and only offers to enable when 2FA is off', () => {
    render(<TwoFactorSettings user={makeUser(false)} />);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.queryByText('Enabled')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });

  it('shows "enabled" and only offers to disable when 2FA is on', () => {
    render(<TwoFactorSettings user={makeUser(true)} />);
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.queryByText('Disabled')).toBeNull();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable' })).toBeNull();
  });
});

type MutateOptions<T> = { onSuccess?: (data: T) => void; onError?: (err: Error) => void };

// #652 — a wrong code or password showed the server's raw code
// ("INVALID_TOTP_CODE") whatever the language, and both code fields opened the
// letter keyboard on phones.
describe('TwoFactorSettings messages and code fields (#652)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    generate.mockImplementation((_v: unknown, o: MutateOptions<{ qrCodeUrl: string; secret: string }>) =>
      o.onSuccess?.({ qrCodeUrl: 'data:image/png;base64,', secret: 'ABC' }));
  });

  function openEnable() {
    render(<TwoFactorSettings user={makeUser(false)} />);
    fireEvent.click(screen.getByRole('button', { name: translate('profile.twoFactor.enable') }));
    return screen.getByRole('dialog');
  }

  function openDisable() {
    render(<TwoFactorSettings user={makeUser(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    return screen.getByRole('dialog');
  }

  it.each([
    ['en', 'Incorrect verification code.'],
    ['fr', 'Code de vérification incorrect.'],
  ])('%s: a wrong code when turning 2FA on reads as a sentence, not INVALID_TOTP_CODE', async (lng, expected) => {
    await i18n.changeLanguage(lng);
    turnOn.mockImplementation((_v: unknown, o: MutateOptions<unknown>) => o.onError?.(new Error('INVALID_TOTP_CODE')));
    const dialog = openEnable();
    fireEvent.change(within(dialog).getByLabelText(translate('profile.twoFactor.codeLabel')), { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: translate('actions.confirm') }));

    expect(within(dialog).getByRole('alert').textContent).toBe(expected);
  });

  it('a wrong password when turning 2FA off says the password is wrong', () => {
    turnOff.mockImplementation((_v: unknown, o: MutateOptions<unknown>) => o.onError?.(new Error('INVALID_CREDENTIALS')));
    const dialog = openDisable();
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.change(within(dialog).getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));

    expect(within(dialog).getByRole('alert').textContent).toBe('Incorrect current password');
  });

  it('an unknown code falls back to a generic sentence', () => {
    generate.mockImplementation((_v: unknown, o: MutateOptions<unknown>) => o.onError?.(new Error('2FA_ALREADY_ENABLED')));
    const dialog = openEnable();
    expect(within(dialog).getByRole('alert').textContent).toBe('An unexpected error occurred.');
  });

  it('the turn-on code field opens the numeric keypad and offers one-time-code autofill', () => {
    const field = within(openEnable()).getByLabelText('6-digit code');
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.getAttribute('autocomplete')).toBe('one-time-code');
    expect(field.getAttribute('pattern')).toBe('[0-9]*');
  });

  it('the turn-off code field does too, and switches to the full keyboard for a backup code', () => {
    const dialog = openDisable();
    const code = within(dialog).getByLabelText('6-digit code');
    expect(code.getAttribute('inputmode')).toBe('numeric');
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Use a backup code' }));
    const backup = within(dialog).getByLabelText('Backup code');
    expect(backup.getAttribute('inputmode')).toBe('text');
    expect(backup.getAttribute('maxlength')).toBe('20');
  });
});
