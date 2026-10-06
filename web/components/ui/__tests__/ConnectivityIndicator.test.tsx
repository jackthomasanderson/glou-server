import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// #195/#205 — the indicator was a plain <span> with its text only in a hover
// tooltip: invisible on a phone and unreachable by keyboard or touch.

const state = {
  online: true as boolean | null,
  sync: { pendingCount: 0, syncingCount: 0, failedCount: 0, conflictCount: 0, hasPendingWork: false },
};

vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => state.online }));
vi.mock('@/hooks/useOfflineSync', () => ({ useOfflineSync: () => state.sync }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) => (o?.count !== undefined ? `${k}:${o.count}` : k),
  }),
}));

import { ConnectivityIndicator } from '../ConnectivityIndicator';

describe('ConnectivityIndicator (#195, #205)', () => {
  beforeEach(() => {
    state.online = true;
    state.sync = { pendingCount: 0, syncingCount: 0, failedCount: 0, conflictCount: 0, hasPendingWork: false };
  });

  it('is a real, named, focusable button', () => {
    render(<ConnectivityIndicator />);
    const button = screen.getByRole('button', { name: 'connectivity.online' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('tabindex')).not.toBe('-1');
  });

  it('shows offline with an icon and a label, not by colour alone', () => {
    state.online = false;
    const { container } = render(<ConnectivityIndicator />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('button').textContent).toContain('connectivity.offline');
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('connectivity.featuresAffected');
  });

  it('shows the number of changes waiting to be sent', () => {
    state.sync = { pendingCount: 3, syncingCount: 0, failedCount: 0, conflictCount: 0, hasPendingWork: true };
    render(<ConnectivityIndicator />);
    expect(screen.getByRole('button').textContent).toContain('3');
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('connectivity.sync.pending:3');
  });

  it('announces status changes from a live region outside the button', () => {
    state.online = false;
    render(<ConnectivityIndicator />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('connectivity.offline');
    // A button's children are presentational: a live region inside it would never be read.
    expect(screen.getByRole('button').contains(status)).toBe(false);
  });
});
