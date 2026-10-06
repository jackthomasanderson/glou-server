import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// #201 — a wrong password showed a red banner that nothing announced: focus does
// not move on submit, so a screen-reader user heard silence.

const mutate = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children?: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useAuth', () => ({
  useLogin: () => ({ mutate, isPending: false }),
  useVerify2faLogin: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { LoginForm } from '../LoginForm';

describe('LoginForm error announcement (#201)', () => {
  it('announces a failed sign-in through an alert', async () => {
    mutate.mockImplementation((_values: unknown, opts: { onError: (e: Error) => void }) => {
      opts.onError(new Error('INVALID_CREDENTIALS'));
    });
    render(<LoginForm />);
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'alice' } });
    const password = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(password, { target: { value: 'wrong-password' } });
    fireEvent.submit(password.closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBeTruthy();
  });
});

// #206 — the sign-in fields looked optional: nothing marked them as required, to
// sight (no asterisk) or to assistive technology.
describe('LoginForm required fields (#206)', () => {
  it('marks the identifier and password as required', () => {
    render(<LoginForm />);
    const identifier = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    const password = document.querySelector('input[type="password"]') as HTMLInputElement;
    for (const input of [identifier, password]) {
      expect(input.required || input.getAttribute('aria-required') === 'true').toBe(true);
    }
  });
});
