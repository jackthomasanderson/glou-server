import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderWithQuery, stubFetch, CONFIG, type Answer } from './configTestKit';

// #669 — GET /api/admin/backups/health answered without the `data` envelope the
// web client unwraps, the resulting error was swallowed, and the "backups folder
// not writable" banner could never show. Only fetch is stubbed here: the real
// config client and response handling run, fed with the API's actual answer.

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

/** Answers the config, and the health route with `health`; every other call with a 500. */
function stubApi(health: Answer) {
  stubFetch({ '/admin/config': { status: 200, body: { data: CONFIG } }, '/admin/backups/health': health });
}

/** Waits for the page to leave its loading skeleton. */
const loaded = () => screen.findByText('adminConfig.backup.runNow.title');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SystemConfigSection — backups folder health (#669)', () => {
  it('shows the warning banner when the API cannot write to the backups folder', async () => {
    stubApi({ status: 200, body: { data: { directoryWritable: false } } });
    renderWithQuery(<SystemConfigSection />);

    const banner = await screen.findByText('adminConfig.backup.dirNotWritable');
    expect(banner.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText('adminConfig.backup.dirCheckFailed')).toBeNull();
  });

  it('shows no banner when the folder is writable', async () => {
    stubApi({ status: 200, body: { data: { directoryWritable: true } } });
    renderWithQuery(<SystemConfigSection />);
    await loaded();
    // let the health call settle
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('adminConfig.backup.dirNotWritable')).toBeNull();
    expect(screen.queryByText('adminConfig.backup.dirCheckFailed')).toBeNull();
  });

  it('says so when the check itself fails, instead of staying silent', async () => {
    stubApi({ status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } });
    renderWithQuery(<SystemConfigSection />);

    const banner = await screen.findByText('adminConfig.backup.dirCheckFailed');
    expect(banner.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText('adminConfig.backup.dirNotWritable')).toBeNull();
  });

  it('does not silently ignore an answer without the data envelope (the shape before the fix)', async () => {
    stubApi({ status: 200, body: { directoryWritable: false } });
    renderWithQuery(<SystemConfigSection />);

    expect(await screen.findByText('adminConfig.backup.dirCheckFailed')).toBeInTheDocument();
  });
});

// #756: the Data tab title (backups) carries a marker while backups are off or none succeeded.
describe('SystemConfigSection — Data tab marker (#756)', () => {
  it('marks the Data tab when the page reports a backup problem', async () => {
    stubApi({ status: 200, body: { data: { directoryWritable: true } } });
    renderWithQuery(<SystemConfigSection hasBackupProblem />);
    await loaded();
    const marker = screen.getByRole('img', { name: 'admin.backupWarning.marker' });
    expect(marker.closest('span')).toHaveTextContent('adminConfig.tabs.data');
  });

  it('shows no marker otherwise', async () => {
    stubApi({ status: 200, body: { data: { directoryWritable: true } } });
    renderWithQuery(<SystemConfigSection />);
    await loaded();
    expect(screen.queryByRole('img', { name: 'admin.backupWarning.marker' })).toBeNull();
  });
});
