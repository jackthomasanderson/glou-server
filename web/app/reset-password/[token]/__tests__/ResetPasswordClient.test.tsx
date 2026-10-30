import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

// #640 — a reset link checked while the server was briefly unreachable was
// declared "invalid or expired", and a throttled reset said "try again".

const validateResetToken = vi.fn();
const resetPassword = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'tok' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/link', () => ({ default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a> }));
// The interpolated count is appended so the "wait N minutes" message can be checked.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) => (o?.count === undefined ? k : `${k}:${o.count}`),
  }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useBrowserTabTitle', () => ({ useBrowserTabTitle: () => undefined }));
vi.mock('@/lib/config/client', () => ({
  configClient: {
    validateResetToken: (token: string) => validateResetToken(token),
    resetPassword: (token: string, password: string) => resetPassword(token, password),
  },
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, type, onPress, isDisabled }: {
    children?: ReactNode; type?: 'submit' | 'button'; onPress?: () => void; isDisabled?: boolean;
  }) => <button type={type ?? 'button'} onClick={onPress} disabled={isDisabled}>{children}</button>,
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CircularProgress: () => <div />,
  Input: ({ label, type, value, onValueChange }: {
    label?: string; type?: string; value?: string; onValueChange?: (v: string) => void;
  }) => <input aria-label={label} type={type} value={value} onChange={(e) => onValueChange?.(e.target.value)} />,
}));

import { ResetPasswordClient } from '../ResetPasswordClient';

beforeEach(() => {
  validateResetToken.mockReset();
  resetPassword.mockReset();
});

describe('ResetPasswordClient link check (#640)', () => {
  it('a network error offers to retry instead of calling the link invalid', async () => {
    validateResetToken.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ valid: true });
    render(<ResetPasswordClient />);

    expect(await screen.findByText('status.serverUnreachable')).toBeInTheDocument();
    expect(screen.queryByText('resetPassword.invalidToken')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'status.retry' }));
    expect(await screen.findByLabelText('resetPassword.newPasswordLabel')).toBeInTheDocument();
    expect(validateResetToken).toHaveBeenCalledTimes(2);
  });

  it('the server saying the link is dead still says so', async () => {
    validateResetToken.mockResolvedValue({ valid: false });
    render(<ResetPasswordClient />);
    expect(await screen.findByText('resetPassword.invalidToken')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'status.retry' })).toBeNull();
  });

  it('too many attempts on the new password says how long to wait', async () => {
    validateResetToken.mockResolvedValue({ valid: true });
    resetPassword.mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 429, 900));
    render(<ResetPasswordClient />);

    const password = 'a-long-enough-password';
    fireEvent.change(await screen.findByLabelText('resetPassword.newPasswordLabel'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('resetPassword.confirmLabel'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'resetPassword.submit' }));

    expect((await screen.findByRole('alert')).textContent).toBe('auth.errors.TOO_MANY_REQUESTS:15');
  });
});
