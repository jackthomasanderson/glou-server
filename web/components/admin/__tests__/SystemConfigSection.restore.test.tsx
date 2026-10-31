import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #666 — a restore now takes a backup of the current data first and is refused
// if that backup fails. The dialog has to say so, the refusal has to be
// readable, and the history has to show the new safety backup afterwards.
// Only fetch is stubbed: the real config client and response handling run.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useScan', () => ({ useScanStatus: () => ({ data: undefined }) }));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
// Every tab's content is rendered at once, so the Backups tab needs no click.
vi.mock('@heroui/react', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, onPress, 'aria-label': ariaLabel }: { children?: ReactNode; onPress?: () => void; 'aria-label'?: string }) => (
      <button type="button" aria-label={ariaLabel} onClick={onPress}>{children}</button>
    ),
    Input: ({ label, placeholder, onValueChange }: { label?: string; placeholder?: string; onValueChange?: (v: string) => void }) => (
      <input aria-label={label ?? placeholder} onChange={(e) => onValueChange?.(e.target.value)} />
    ),
    Switch: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
    Chip: Box,
    Skeleton: Box,
    Tabs: Box,
    Tab: ({ title, children }: { title?: ReactNode; children?: ReactNode }) => <section>{title}{children}</section>,
    Select: ({ label }: { label?: ReactNode }) => <div>{label}</div>,
    SelectItem: () => null,
    ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
      <>{typeof children === 'function' ? children(() => {}) : children}</>
    ),
    ModalHeader: Box,
    ModalBody: Box,
    ModalFooter: Box,
  };
});

import { SystemConfigSection } from '../SystemConfigSection';

const run = (id: string, runAt: string) => ({
  id, runAt, trigger: 'scheduled', userId: null, success: true,
  filePath: `/app/backups/${id}.sql.gz`, fileSizeBytes: 2048, error: null, durationMs: 120,
});
const OLD = run('old', '2026-10-27T03:00:00.000Z');
const SAFETY = { ...run('safety', '2026-10-30T10:00:00.000Z'), trigger: 'manual' };

/** Answers the history route, then the restore route with `restore`; every other admin call with a 500 (ignored by the page). */
function stubApi(restore: { status: number; body: unknown } | 'timeout') {
  let restored = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let answer: { status: number; body: unknown } = { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
    if (url.endsWith('/api/admin/backups/runs')) {
      answer = { status: 200, body: { data: restored && restore !== 'timeout' && restore.status === 200 ? [SAFETY, OLD] : [OLD] } };
    } else if (url.endsWith('/api/admin/backups/old/restore') && init?.method === 'POST') {
      // What fetch rejects with once the request's timeout signal fires.
      if (restore === 'timeout') throw new DOMException('The operation timed out.', 'TimeoutError');
      restored = true;
      answer = restore;
    }
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openRestoreDialog() {
  render(<SystemConfigSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.history.restore' }));
}

function confirmRestore() {
  fireEvent.change(screen.getByLabelText('adminConfig.backup.restore.keyword'), { target: { value: 'adminConfig.backup.restore.keyword' } });
  fireEvent.change(screen.getByLabelText('adminConfig.backup.passwordLabel'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: 'adminConfig.backup.restore.confirm' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SystemConfigSection — restore takes a safety backup first (#666)', () => {
  it('says in the dialog that the current data is backed up first', async () => {
    stubApi({ status: 200, body: { data: { ok: true, safetyBackupRunId: 'safety' } } });
    await openRestoreDialog();

    expect(screen.getByRole('dialog')).toHaveTextContent('adminConfig.backup.restore.safetyCopy');
  });

  it('explains that nothing was restored when the safety backup failed', async () => {
    stubApi({ status: 500, body: { error: 'BACKUP_BEFORE_RESTORE_FAILED' } });
    await openRestoreDialog();
    confirmRestore();

    const message = await screen.findByText('adminConfig.backup.restore.errors.BACKUP_BEFORE_RESTORE_FAILED');
    expect(message.closest('[role="alert"]')).not.toBeNull();
  });

  it('says the restore is still running on the server when the browser stops waiting', async () => {
    stubApi('timeout');
    await openRestoreDialog();
    confirmRestore();

    const message = await screen.findByText('adminConfig.backup.restore.errors.TIMEOUT');
    expect(message.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText(/timed out/)).toBeNull();
  });

  it('shows the safety backup in the history once the restore is done', async () => {
    const fetchMock = stubApi({ status: 200, body: { data: { ok: true, safetyBackupRunId: 'safety' } } });
    await openRestoreDialog();
    expect(screen.getAllByRole('button', { name: 'adminConfig.backup.history.restore' })).toHaveLength(1);

    confirmRestore();

    expect(await screen.findByText('adminConfig.backup.restore.success')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'adminConfig.backup.history.restore' })).toHaveLength(2);
    });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/admin/backups/runs'))).toHaveLength(2);
  });
});

describe('SystemConfigSection — backup taken before a migration (FEAT-94)', () => {
  it('labels it "before update, kept" from its file name, and only it', async () => {
    const beforeMigration = {
      ...run('bm', '2026-11-01T08:30:00.123Z'),
      filePath: '/app/backups/glou-backup-before-migration-2026-11-01T08-30-00-123Z.sql.gz',
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const ok = String(input).endsWith('/api/admin/backups/runs');
      return {
        ok, status: ok ? 200 : 500,
        json: async () => (ok ? { data: [beforeMigration, OLD] } : { error: 'INTERNAL_SERVER_ERROR' }),
      } as Response;
    }));
    render(<SystemConfigSection />);
    expect(await screen.findAllByText('adminConfig.backup.history.beforeMigration')).toHaveLength(1);
  });
});
