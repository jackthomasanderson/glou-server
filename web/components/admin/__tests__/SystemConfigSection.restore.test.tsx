import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { notifyError, notifySuccess } from '@/lib/toast';
import { renderWithQuery, stubFetch, CONFIG, type Answer } from './configTestKit';

// #666 — a restore now takes a backup of the current data first and is refused
// if that backup fails. The dialog has to say so, the refusal has to be
// readable, and the history has to show the new safety backup afterwards.
// Only fetch is stubbed: the real config client and response handling run.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useScan', () => ({ useScanStatus: () => ({ data: undefined }) }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
// The admin's own 2FA state, read by the step-up dialog (#890): off here.
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: { id: 'a1', isTwoFactorEnabled: false }, refetch: () => {} }) }));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async () => (await import('./configTestKit')).heroUiMock());

import { SystemConfigSection } from '../SystemConfigSection';

const run = (id: string, runAt: string) => ({
  id, runAt, trigger: 'scheduled', userId: null, success: true,
  filePath: `/app/backups/${id}.sql.gz`, fileSizeBytes: 2048, error: null, durationMs: 120,
});
const OLD = run('old', '2026-10-27T03:00:00.000Z');
const SAFETY = { ...run('safety', '2026-10-30T10:00:00.000Z'), trigger: 'manual' };

/** Answers the config and history routes, then the restore route with `restore`; every other call with a 500. */
function stubApi(restore: Answer | 'timeout') {
  let restored = false;
  return stubFetch({
    '/admin/config': { status: 200, body: { data: CONFIG } },
    '/admin/backups/runs': () => ({ status: 200, body: { data: restored && restore !== 'timeout' && restore.status === 200 ? [SAFETY, OLD] : [OLD] } }),
    'POST /admin/backups/old/restore': () => {
      // What fetch rejects with once the request's timeout signal fires.
      if (restore === 'timeout') throw new DOMException('The operation timed out.', 'TimeoutError');
      restored = true;
      return restore;
    },
  });
}

async function openRestoreDialog() {
  renderWithQuery(<SystemConfigSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.history.restore' }));
}

/** The typed keyword, then the step-up dialog (#890): the admin's password. */
function confirmRestore() {
  fireEvent.change(screen.getByLabelText('adminConfig.backup.restore.keyword'), { target: { value: 'adminConfig.backup.restore.keyword' } });
  fireEvent.click(screen.getByRole('button', { name: 'adminConfig.backup.restore.confirm' }));
  fireEvent.change(screen.getByLabelText('admin.users.stepUpPassword'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.confirm' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.backup.restore.errors.BACKUP_BEFORE_RESTORE_FAILED'));
  });

  // #471 (lot Z): a backup of another version of Glou is refused by the API, nothing restored.
  it.each(['BACKUP_FROM_OLDER_VERSION', 'BACKUP_FROM_NEWER_VERSION'])('explains the refusal of %s', async (code) => {
    stubApi({ status: 409, body: { error: code } });
    await openRestoreDialog();
    confirmRestore();

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith(`adminConfig.backup.restore.errors.${code}`));
  });

  it('says the restore is still running on the server when the browser stops waiting', async () => {
    stubApi('timeout');
    await openRestoreDialog();
    confirmRestore();

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.backup.restore.errors.TIMEOUT'));
  });

  it('says an unknown refusal in words, never its raw code (#615)', async () => {
    stubApi({ status: 500, body: { error: 'Command failed: psql exited with code 3' } });
    await openRestoreDialog();
    confirmRestore();

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.backup.restore.error'));
  });

  it('shows the safety backup in the history once the restore is done', async () => {
    const fetchMock = stubApi({ status: 200, body: { data: { ok: true, safetyBackupRunId: 'safety' } } });
    await openRestoreDialog();
    expect(screen.getAllByRole('button', { name: 'adminConfig.backup.history.restore' })).toHaveLength(1);

    confirmRestore();

    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.backup.restore.success'));
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
    stubFetch({
      '/admin/config': { status: 200, body: { data: CONFIG } },
      '/admin/backups/runs': { status: 200, body: { data: [beforeMigration, OLD] } },
    });
    renderWithQuery(<SystemConfigSection />);
    expect(await screen.findAllByText('adminConfig.backup.history.beforeMigration')).toHaveLength(1);
  });
});
