import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PublicUser } from '@/hooks/useAuth';

// #766 — the trusted-device block was shown with two-factor off, and always
// offered both "Trust" and "Stop trusting": nobody could tell the real state.

let mockTrustedUntil: string | null = null;
let mockTrustLoading = false;
let mockTrustError = false;
const refetch = vi.fn();
const trustedDeviceQuery = vi.fn();
const trustMutate = vi.fn();
const untrustMutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.date ? `${k} ${String(o.date)}` : k),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/components/ui/ErrorState', () => ({
  ErrorState: ({ message, onRetry }: { message: string; onRetry: () => void }) => (
    <div role="alert">{message}<button type="button" onClick={onRetry}>actions.retry</button></div>
  ),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useAuth', () => ({
  useTrustedDevice: (enabled: boolean) => {
    trustedDeviceQuery(enabled);
    if (mockTrustError) return { data: undefined, isLoading: false, isError: true, refetch, isRefetching: false };
    return { data: mockTrustLoading ? undefined : { trustedUntil: mockTrustedUntil }, isLoading: mockTrustLoading, isError: false, refetch, isRefetching: false };
  },
  useTrustDevice: () => ({ mutate: trustMutate, isPending: false }),
  useUntrustDevice: () => ({ mutate: untrustMutate, isPending: false }),
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
  Input: ({ label, type, value, onValueChange }: {
    label?: string; type?: string; value?: string; onValueChange?: (v: string) => void;
  }) => (
    <input aria-label={label} type={type} value={value} onChange={(e) => onValueChange?.(e.target.value)} />
  ),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Skeleton: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { TrustedDeviceSettings } from '../TrustedDeviceSettings';

const member = (isTwoFactorEnabled: boolean) => ({ id: 'u1', isTwoFactorEnabled } as unknown as PublicUser);
const TRUST = 'profile.sessions.trustDevice';
const UNTRUST = 'profile.sessions.untrustDevice';

describe('TrustedDeviceSettings (#766)', () => {
  beforeEach(() => {
    mockTrustedUntil = null;
    mockTrustLoading = false;
    mockTrustError = false;
    trustedDeviceQuery.mockClear();
    trustMutate.mockClear();
    untrustMutate.mockClear();
  });

  it('2FA off: no trusted-device text or button, and the state is not even asked', () => {
    const { container } = render(<TrustedDeviceSettings user={member(false)} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).toBeNull();
    expect(trustedDeviceQuery).toHaveBeenCalledWith(false);
  });

  it('2FA on, device trusted: says until when, and offers only to stop trusting it', () => {
    mockTrustedUntil = '2026-12-10T09:00:00.000Z';
    render(<TrustedDeviceSettings user={member(true)} />);
    expect(trustedDeviceQuery).toHaveBeenCalledWith(true);
    expect(screen.getByText(/^profile\.sessions\.trustedUntil /)).toBeInTheDocument();
    expect(screen.queryByText('profile.sessions.trustDescription')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: TRUST })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: UNTRUST }));
    expect(untrustMutate).toHaveBeenCalledTimes(1);
  });

  it('2FA on, device not trusted: offers only to trust it, with the password and a code', () => {
    render(<TrustedDeviceSettings user={member(true)} />);
    expect(screen.getByText('profile.sessions.trustDescription')).toBeInTheDocument();
    expect(screen.queryByText(/profile\.sessions\.trustedUntil/)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: UNTRUST })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: TRUST }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: TRUST }) as HTMLButtonElement;
    fireEvent.change(within(dialog).getByLabelText('profile.passwordLabel'), { target: { value: 'secret' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('profile.twoFactor.codeLabel'), { target: { value: '123456' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(trustMutate).toHaveBeenCalledWith({ password: 'secret', code: '123456' }, expect.anything());
  });

  it('2FA on, state still loading: no button that could contradict it', () => {
    mockTrustLoading = true;
    render(<TrustedDeviceSettings user={member(true)} />);
    expect(screen.queryByRole('button', { name: TRUST })).toBeNull();
    expect(screen.queryByRole('button', { name: UNTRUST })).toBeNull();
  });

  it('2FA on, state unreadable: says so and offers to retry, no endless skeleton (review)', () => {
    mockTrustError = true;
    render(<TrustedDeviceSettings user={member(true)} />);
    expect(screen.getByRole('alert').textContent).toContain('profile.sessions.trustLoadError');
    expect(screen.queryByRole('button', { name: TRUST })).toBeNull();
    expect(screen.queryByRole('button', { name: UNTRUST })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
