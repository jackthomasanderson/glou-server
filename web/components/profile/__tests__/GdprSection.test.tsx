import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import type { PublicUser } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';

// #603: asking for the account's deletion took one click on an open session.
// It now asks for the password, and says why it was refused in the dialog.

let i18n: I18n;
const translate = (k: string, o?: Record<string, unknown>) =>
  (i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string)(k, o);
const requestDeletion = vi.fn();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate, i18n: { language: 'en' } }) }));
vi.mock('@/hooks/useAuth', () => ({
  useExportData: () => ({ mutate: vi.fn(), isPending: false }),
  useRequestAccountDeletion: () => ({ mutate: requestDeletion, isPending: false }),
  useCancelAccountDeletion: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useCsvExport', () => ({ useCsvExport: () => ({ mutate: vi.fn(), isPending: false }) }));
// #641 (PR #908): the profile also hosts the file import; it is covered by GdprSection.import.test.tsx.
vi.mock('@/hooks/useImport', () => ({ useCsvConfirmPending: () => false }));
vi.mock('@/components/onboarding/steps/CsvImportStep', () => ({ CsvImportStep: () => null }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>{children}</button>
  ),
  Input: ({ label, placeholder, type, value, onValueChange }: { label?: string; placeholder?: string; type?: string; value?: string; onValueChange?: (v: string) => void }) => (
    <input aria-label={label ?? placeholder} type={type} value={value} onChange={(e) => onValueChange?.(e.target.value)} />
  ),
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Checkbox: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
  ModalContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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

import { GdprSection } from '../GdprSection';

const user = { id: 'u1', username: 'alice', deletionRequestedAt: null } as unknown as PublicUser;
type MutateOptions = { onSuccess?: () => void; onError?: (err: Error) => void };

function openDelete() {
  render(<GdprSection user={user} />);
  fireEvent.click(screen.getByRole('button', { name: translate('gdpr.deleteButton') }));
  return screen.getByRole('dialog');
}

function fill(dialog: HTMLElement, password: string) {
  fireEvent.change(within(dialog).getByLabelText(translate('gdpr.deleteKeyword')), { target: { value: translate('gdpr.deleteKeyword') } });
  fireEvent.change(within(dialog).getByLabelText(translate('profile.passwordLabel')), { target: { value: password } });
}

describe('GdprSection account deletion (#603)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it('asks for the password as well as the keyword, and sends it', () => {
    const dialog = openDelete();
    const confirm = within(dialog).getByRole('button', { name: translate('gdpr.deleteConfirm') });
    fireEvent.change(within(dialog).getByLabelText(translate('gdpr.deleteKeyword')), { target: { value: translate('gdpr.deleteKeyword') } });
    expect(confirm).toBeDisabled();

    fill(dialog, 'my-password');
    fireEvent.click(confirm);

    expect(requestDeletion).toHaveBeenCalledWith({ password: 'my-password' }, expect.anything());
  });

  it.each([
    ['en', 'INVALID_CREDENTIALS', 'Incorrect current password'],
    ['fr', 'INVALID_CREDENTIALS', 'Mot de passe actuel incorrect'],
    ['en', 'CANNOT_DELETE_LAST_ADMIN', en.gdpr.deleteErrors.CANNOT_DELETE_LAST_ADMIN],
    ['fr', 'CANNOT_DELETE_LAST_ADMIN', fr.gdpr.deleteErrors.CANNOT_DELETE_LAST_ADMIN],
  ])('%s: a %s refusal is said in the dialog, which stays open', async (lng, code, expected) => {
    await i18n.changeLanguage(lng);
    requestDeletion.mockImplementation((_v: unknown, o: MutateOptions) => o.onError?.(new ApiError(code, 401)));
    const dialog = openDelete();
    fill(dialog, 'not-it');
    fireEvent.click(within(dialog).getByRole('button', { name: translate('gdpr.deleteConfirm') }));

    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe(expected);
  });

  it('a throttled request says how long to wait', () => {
    requestDeletion.mockImplementation((_v: unknown, o: MutateOptions) => o.onError?.(new ApiError('TOO_MANY_REQUESTS', 429, 600)));
    const dialog = openDelete();
    fill(dialog, 'guess');
    fireEvent.click(within(dialog).getByRole('button', { name: translate('gdpr.deleteConfirm') }));

    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe(translate('auth.errors.TOO_MANY_REQUESTS', { count: 10 }));
  });
});
