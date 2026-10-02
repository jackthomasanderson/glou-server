import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from '../ErrorState';
import { EmptyState } from '../EmptyState';

// ─── ISSUE_118 / ISSUE_121 ──────────────────────────────────────────────────
// HeroUI is stubbed with plain DOM elements: react-aria's internals need
// browser APIs jsdom does not implement, and what matters here is the shared
// contract of the two states (message, retry wiring, reset action), not
// HeroUI's own rendering.
vi.mock('@heroui/react', () => ({
  Button: ({
    children,
    onPress,
    isLoading,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    isLoading?: boolean;
  }) => (
    <button type="button" onClick={onPress} data-loading={isLoading ? 'true' : 'false'}>
      {children}
    </button>
  ),
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ErrorState', () => {
  it('shows the provided message and a retry button wired to the handler', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Boom" onRetry={onRetry} />);

    expect(screen.getByText('Boom')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'status.retry' });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to the generic translated message', () => {
    render(<ErrorState onRetry={() => undefined} />);
    expect(screen.getByText('status.error')).toBeInTheDocument();
  });

  it('hides the retry button when no handler is provided', () => {
    render(<ErrorState message="Boom" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    const onReset = vi.fn();
    render(
      <EmptyState
        title="No results for these filters"
        description="Try removing one"
        action={<button type="button" onClick={onReset}>Reset filters</button>}
      />,
    );

    expect(screen.getByText('No results for these filters')).toBeInTheDocument();
    expect(screen.getByText('Try removing one')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
