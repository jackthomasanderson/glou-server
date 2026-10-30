import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

// #640 — asking for the link more than five times in 15 minutes said
// "An error occurred. Try again.", which only extended the block.

const forgotPassword = vi.fn();

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
  configClient: { forgotPassword: (email: string) => forgotPassword(email) },
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, type, isDisabled }: { children?: ReactNode; type?: 'submit' | 'button'; isDisabled?: boolean }) => (
    <button type={type ?? 'button'} disabled={isDisabled}>{children}</button>
  ),
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Input: ({ label, type, value, onValueChange }: {
    label?: string; type?: string; value?: string; onValueChange?: (v: string) => void;
  }) => <input aria-label={label} type={type} value={value} onChange={(e) => onValueChange?.(e.target.value)} />,
}));

import { ForgotPasswordClient } from '../ForgotPasswordClient';

describe('ForgotPasswordClient throttled (#640)', () => {
  it('says how long to wait', async () => {
    forgotPassword.mockRejectedValue(new ApiError('TOO_MANY_REQUESTS', 429, 13 * 60 + 5));
    render(<ForgotPasswordClient />);
    const email = screen.getByLabelText('forgotPassword.emailLabel');
    fireEvent.change(email, { target: { value: 'alice@example.com' } });
    fireEvent.submit(email.closest('form') as HTMLFormElement);

    expect((await screen.findByRole('alert')).textContent).toBe('auth.errors.TOO_MANY_REQUESTS:14');
    expect(forgotPassword).toHaveBeenCalledWith('alice@example.com');
  });
});
