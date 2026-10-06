import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { username: 'alice', hasPin: false, avatarUrl: null } }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@heroui/react', () => ({
  Avatar: () => <span />,
  Button: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Input: ({ label }: { label?: string }) => <input aria-label={label} />,
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
