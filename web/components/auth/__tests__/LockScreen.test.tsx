import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

// The interpolated count is appended so the "wait N minutes" message can be checked.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) => (o?.count === undefined ? k : `${k}:${o.count}`),
  }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { username: 'alice', hasPin: false, avatarUrl: null } }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@heroui/react', () => ({
  Avatar: () => <span />,
  Button: ({ children, type, onPress, isDisabled }: {
    children?: ReactNode; type?: 'submit' | 'button'; onPress?: () => void; isDisabled?: boolean;
  }) => <button type={type ?? 'button'} onClick={onPress} disabled={isDisabled}>{children}</button>,
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Input: ({ label, type, value, onValueChange }: {
    label?: string; type?: string; value?: string; onValueChange?: (v: string) => void;
  }) => <input aria-label={label} type={type} value={value} onChange={(e) => onValueChange?.(e.target.value)} />,
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tab: () => null,
}));

import { LockScreen } from '../LockScreen';

describe('LockScreen semantics (#200)', () => {
  it('is a labelled modal dialog', () => {
    render(<LockScreen unlock={vi.fn()} isUnlocking={false} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)?.textContent).toBe('lock.screenTitle');
  });
});

// #582: a wrong code, too many attempts or an unreachable server all left the
// button spinning then idle, with no message: the app looked frozen.
describe('LockScreen failed unlock (#582)', () => {
  function submitPassword(unlock: (password?: string, pin?: string) => Promise<boolean>) {
    render(<LockScreen unlock={unlock} isUnlocking={false} />);
    const field = screen.getByLabelText('lock.passwordLabel') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'wrong-password' } });
    fireEvent.submit(field.closest('form') as HTMLFormElement);
    return field;
  }

  it('wrong code: announces "incorrect password or PIN" and clears the field', async () => {
    const unlock = vi.fn().mockResolvedValue(false);
    const field = submitPassword(unlock);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('lock.error');
    expect(unlock).toHaveBeenCalledWith('wrong-password', undefined);
    expect(field.value).toBe('');
  });

  it('too many attempts: says how many minutes to wait', async () => {
    submitPassword(vi.fn().mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 429, 9 * 60 + 30)));
    expect((await screen.findByRole('alert')).textContent).toBe('auth.errors.TOO_MANY_REQUESTS:10');
  });

  it('server unreachable: says so', async () => {
    submitPassword(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect((await screen.findByRole('alert')).textContent).toBe('status.serverUnreachable');
  });

  it('a successful unlock shows no message', async () => {
    const unlock = vi.fn().mockResolvedValue(true);
    submitPassword(unlock);
    await waitFor(() => expect(unlock).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
