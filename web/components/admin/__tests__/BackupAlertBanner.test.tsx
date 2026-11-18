import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #1048: the banner can be hidden until the next failure, and one failure brings it back.

let health: Record<string, unknown> | undefined;
let pathname = '/cave';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: { id: 'a1', isAdmin: true } }) }));
vi.mock('@/hooks/useAdmin', () => ({ useAdminBackupHealth: () => ({ data: health }) }));

import { BackupAlertBanner } from '../BackupAlertBanner';

const failed = (id: string) => ({ directoryWritable: true, lastRunFailed: true, lastSuccessAt: null, lastFailure: { id, at: '2026-11-18T03:00:00Z', error: 'PG_DUMP_SPAWN_FAILED: x' } });

beforeEach(() => { localStorage.clear(); pathname = '/cave'; });

describe('BackupAlertBanner (#1048)', () => {
  it('shows one message, with a way to open the backups and a way to hide it', () => {
    health = { ...failed('run-1'), overdue: true };
    render(<BackupAlertBanner />);
    expect(screen.getAllByText(/^admin\.backupWarning\./).map((n) => n.textContent)).toEqual(['admin.backupWarning.failed', 'admin.backupWarning.open']);
    expect(screen.getByRole('button', { name: 'adminConfig.backup.failure.dismiss' })).toBeInTheDocument();
  });

  it('stays hidden after being dismissed, also after a reload, but not for a new failure', () => {
    health = failed('run-1');
    const first = render(<BackupAlertBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'adminConfig.backup.failure.dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    first.unmount();

    render(<BackupAlertBanner />);
    expect(screen.queryByRole('alert')).toBeNull();

    health = failed('run-2');
    const next = render(<BackupAlertBanner />);
    expect(next.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('hides for the session even when the browser stores nothing', () => {
    health = failed('run-1');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<BackupAlertBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'adminConfig.backup.failure.dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    vi.restoreAllMocks();
  });

  it('is not shown on the admin page', () => {
    pathname = '/admin';
    health = failed('run-1');
    render(<BackupAlertBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
