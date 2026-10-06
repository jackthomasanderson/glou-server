import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

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
