import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// #206 — the registration fields looked optional.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children?: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useAuth', () => ({ useRegister: () => ({ mutate: vi.fn(), isPending: false }) }));

import { RegisterForm } from '../RegisterForm';

describe('RegisterForm required fields (#206)', () => {
  it('marks every field as required', () => {
    const { container } = render(<RegisterForm />);
    const inputs = Array.from(container.querySelectorAll('input')).filter((i) => i.type !== 'checkbox' && i.type !== 'hidden');
    expect(inputs.length).toBeGreaterThanOrEqual(4);
    for (const input of inputs) {
      expect(input.required || input.getAttribute('aria-required') === 'true').toBe(true);
    }
  });
});

describe('RegisterForm invalid email (#1042)', () => {
  it('says so on the email field, not with the generic "check your entries"', async () => {
    const { container } = render(<RegisterForm />);
    const email = container.querySelector('input[type="email"]') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(await screen.findByText('auth.errors.EMAIL_INVALID')).toBeInTheDocument();
    expect(screen.queryByText('auth.errors.VALIDATION_ERROR')).toBeNull();
  });
});
