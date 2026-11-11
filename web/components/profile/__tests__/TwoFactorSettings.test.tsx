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
const regenerate = vi.fn();
const copyText = vi.fn();
let backupCodesLeft: number | undefined = 10;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ refetch: vi.fn() }),
  useGenerate2fa: () => ({ mutate: generate, isPending: false }),
  useTurnOn2fa: () => ({ mutate: turnOn, isPending: false }),
  useTurnOff2fa: () => ({ mutate: turnOff, isPending: false }),
  useRegenerateBackupCodes: () => ({ mutate: regenerate, isPending: false }),
  useBackupCodesCount: (enabled: boolean) => ({ data: enabled ? backupCodesLeft : undefined }),
}));
vi.mock('@/lib/clipboard', () => ({ copyText: (text: string) => copyText(text) }));
// Closed modals render nothing, like HeroUI's.
// The dismissal props are exposed so the tests can check what HeroUI is told.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children, isDismissable, isKeyboardDismissDisabled, hideCloseButton }: {
    isOpen?: boolean; children?: ReactNode; isDismissable?: boolean; isKeyboardDismissDisabled?: boolean; hideCloseButton?: boolean;
  }) =>
    isOpen ? (
      <div
        role="dialog"
        data-dismissable={String(isDismissable ?? true)}
        data-keyboard-dismiss-disabled={String(isKeyboardDismissDisabled ?? false)}
        data-hide-close-button={String(hideCloseButton ?? false)}
      >
        {children}
      </div>
    ) : null,
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
  Checkbox: ({ children, isSelected, onValueChange }: { children?: ReactNode; isSelected?: boolean; onValueChange?: (v: boolean) => void }) => (
    <label><input type="checkbox" checked={!!isSelected} onChange={(e) => onValueChange?.(e.target.checked)} />{children}</label>
  ),
  Divider: () => <hr />,
  CircularProgress: () => <div />,
  Chip: ({ children, startContent }: { children?: ReactNode; startContent?: ReactNode }) => <span>{startContent}{children}</span>,
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

function makeUser(isTwoFactorEnabled: boolean, isAdmin = false): PublicUser {
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
    isAdmin,
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

// #770 — the weakest state was the least visible one, and admins were not told.
describe('TwoFactorSettings admin recommendation (#770)', () => {
  it('recommends 2FA to an admin who has it off', () => {
    render(<TwoFactorSettings user={makeUser(false, true)} />);
    expect(screen.getByText('Two-factor authentication is recommended for administrator accounts.')).toBeInTheDocument();
  });

  it('says nothing to a member with 2FA off', () => {
    render(<TwoFactorSettings user={makeUser(false, false)} />);
    expect(screen.queryByText('Two-factor authentication is recommended for administrator accounts.')).toBeNull();
  });

  it('says nothing to an admin who already has 2FA on', () => {
    render(<TwoFactorSettings user={makeUser(true, true)} />);
    expect(screen.queryByText('Two-factor authentication is recommended for administrator accounts.')).toBeNull();
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
    fireEvent.change(within(dialog).getByLabelText(translate('profile.passwordLabel')), { target: { value: 'pw' } });
    fireEvent.click(within(dialog).getByRole('button', { name: translate('actions.confirm') }));

    expect(within(dialog).getByRole('alert').textContent).toBe(expected);
  });

  // #603: an open session alone could tie the account to someone else's app.
  it('turning 2FA on asks for the password, and sends it with the code', () => {
    const dialog = openEnable();
    fireEvent.change(within(dialog).getByLabelText('6-digit code'), { target: { value: '123456' } });
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'my-password' } });
    fireEvent.click(confirm);

    expect(turnOn).toHaveBeenCalledWith({ password: 'my-password', code: '123456' }, expect.anything());
  });

  it('a wrong password when turning 2FA on says the password is wrong', () => {
    turnOn.mockImplementation((_v: unknown, o: MutateOptions<unknown>) => o.onError?.(new Error('INVALID_CREDENTIALS')));
    const dialog = openEnable();
    fireEvent.change(within(dialog).getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'not-it' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(within(dialog).getByRole('alert').textContent).toBe('Incorrect current password');
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

// #638 — the backup codes were shown once, with no Copy button, in a dialog
// Escape closed for good; they could not be regenerated nor counted.
describe('TwoFactorSettings backup codes (#638)', () => {
  const CODES = Array.from({ length: 10 }, (_, i) => `${i}`.repeat(20));

  beforeEach(async () => {
    vi.clearAllMocks();
    backupCodesLeft = 10;
    await i18n.changeLanguage('en');
    generate.mockImplementation((_v: unknown, o: MutateOptions<{ qrCodeUrl: string; secret: string }>) =>
      o.onSuccess?.({ qrCodeUrl: 'data:image/png;base64,', secret: 'ABC' }));
    turnOn.mockImplementation((_v: unknown, o: MutateOptions<{ backupCodes: string[] }>) => o.onSuccess?.({ backupCodes: CODES }));
    copyText.mockResolvedValue(true);
  });

  function enableAndGetCodesDialog() {
    render(<TwoFactorSettings user={makeUser(false)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    return screen.getByRole('dialog');
  }

  it('cannot be dismissed in any way until "I\'ve saved my codes" is ticked', () => {
    const dialog = enableAndGetCodesDialog();
    for (const code of CODES) expect(within(dialog).getByText(code)).toBeInTheDocument();

    expect(dialog.dataset.dismissable).toBe('false');
    expect(dialog.dataset.keyboardDismissDisabled).toBe('true');
    expect(dialog.dataset.hideCloseButton).toBe('true');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();

    fireEvent.click(within(dialog).getByLabelText("I've saved my codes"));

    const ticked = screen.getByRole('dialog');
    expect(ticked.dataset.dismissable).toBe('true');
    expect(ticked.dataset.keyboardDismissDisabled).toBe('false');
    expect(ticked.dataset.hideCloseButton).toBe('false');
    fireEvent.click(within(ticked).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('copies every code, one per line', async () => {
    const dialog = enableAndGetCodesDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy the codes' }));

    expect(copyText).toHaveBeenCalledWith(CODES.join('\n'));
    expect(await within(dialog).findByRole('button', { name: 'Codes copied' })).toBeInTheDocument();
  });

  it('says how to copy by hand when the browser refuses', async () => {
    copyText.mockResolvedValue(false);
    const dialog = enableAndGetCodesDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy the codes' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe(translate('profile.twoFactor.copyCodesFailed'));
  });

  it.each([
    ['en', 3, '3 backup codes left'],
    ['en', 1, '1 backup code left'],
    ['fr', 3, '3 codes de secours restants'],
  ])('%s: shows how many backup codes remain (%i)', async (lng, left, expected) => {
    await i18n.changeLanguage(lng);
    backupCodesLeft = left;
    render(<TwoFactorSettings user={makeUser(true)} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('shows no count and no regenerate button while 2FA is off', () => {
    render(<TwoFactorSettings user={makeUser(false)} />);
    expect(screen.queryByRole('button', { name: 'Generate new codes' })).toBeNull();
  });

  function openRegenerate() {
    render(<TwoFactorSettings user={makeUser(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.change(within(dialog).getByLabelText('6-digit code'), { target: { value: '123456' } });
    return dialog;
  }

  it('asks for the password and a code before generating new codes', () => {
    render(<TwoFactorSettings user={makeUser(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Generate' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'pw' } });
    expect(within(dialog).getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it('a wrong password when regenerating says the password is wrong', () => {
    regenerate.mockImplementation((_v: unknown, o: MutateOptions<unknown>) => o.onError?.(new Error('INVALID_CREDENTIALS')));
    const dialog = openRegenerate();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Incorrect current password');
  });

  it('shows the new codes in the same guarded dialog', () => {
    regenerate.mockImplementation((v: unknown, o: MutateOptions<{ backupCodes: string[] }>) => o.onSuccess?.({ backupCodes: CODES }));
    const dialog = openRegenerate();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));

    expect(regenerate).toHaveBeenCalledWith({ password: 'pw', code: '123456' }, expect.anything());
    const codes = screen.getByRole('dialog');
    expect(within(codes).getByText(translate('profile.twoFactor.regenerateSuccess'))).toBeInTheDocument();
    expect(within(codes).getByText(CODES[0])).toBeInTheDocument();
    expect(codes.dataset.keyboardDismissDisabled).toBe('true');
  });
});

// #950: a 32-character secret has no break point and overflows a 320 px card.
describe('TwoFactorSettings setup secret (#950)', () => {
  const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    generate.mockImplementation((_v: unknown, o: { onSuccess?: (d: unknown) => void }) =>
      o.onSuccess?.({ qrCodeUrl: 'data:image/png;base64,', secret: SECRET }));
  });

  function openSetup() {
    render(<TwoFactorSettings user={makeUser(false)} />);
    fireEvent.click(screen.getByRole('button', { name: translate('profile.twoFactor.enable') }));
    return screen.getByRole('dialog');
  }

  it('shows the secret in blocks of 4 that wrap, with no real space to copy', () => {
    const dialog = openSetup();
    const code = dialog.querySelector('code') as HTMLElement;
    expect(code.textContent?.replace(/\s/g, '')).toBe(SECRET);
    expect(code.textContent).toBe(SECRET);
    expect(code.querySelectorAll('span')).toHaveLength(8);
    expect(code.querySelectorAll('wbr')).toHaveLength(7);
  });

  it('copies the raw secret, without the spaces', async () => {
    copyText.mockResolvedValue(true);
    const dialog = openSetup();
    fireEvent.click(within(dialog).getByRole('button', { name: translate('profile.twoFactor.copySecret') }));

    expect(copyText).toHaveBeenCalledWith(SECRET);
    expect((await within(dialog).findByRole('status')).textContent).toBe('Secret key copied');
  });

  it('says so when copying is not possible', async () => {
    copyText.mockResolvedValue(false);
    const dialog = openSetup();
    fireEvent.click(within(dialog).getByRole('button', { name: translate('profile.twoFactor.copySecret') }));

    expect((await within(dialog).findByRole('status')).textContent).toBe(translate('profile.twoFactor.copySecretFailed'));
  });
});
