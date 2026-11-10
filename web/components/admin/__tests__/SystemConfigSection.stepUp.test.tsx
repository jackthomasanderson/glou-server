import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { notifySuccess } from '@/lib/toast';
import { renderWithQuery, stubFetch, sentTo, CONFIG, type Answer } from './configTestKit';

// #890: a stolen admin session could point outgoing mail, the public URL or
// the security alerts at an attacker, or download a dump, with the cookie
// alone. These actions now go through the #638 step-up dialog: the admin's
// password, plus their code when they have 2FA, sent with the request. Only
// fetch is stubbed: the real config client and response handling run.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useScan', () => ({ useScanStatus: () => ({ data: undefined }) }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
// The admin has 2FA on: the dialog asks for a code too.
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'a1', isTwoFactorEnabled: true }, refetch: vi.fn() }),
}));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async () => (await import('./configTestKit')).heroUiMock());

import { SystemConfigSection } from '../SystemConfigSection';

const RUN = {
  id: 'b1', runAt: '2026-10-27T03:00:00.000Z', trigger: 'scheduled', userId: null, success: true,
  filePath: '/app/backups/b1.sql.gz', fileSizeBytes: 2048, error: null, durationMs: 120,
};

/** GETs answer the config and one backup; `writes` answers the gated calls by path. */
function stubApi(writes: Record<string, Answer>) {
  const routes: Record<string, Answer> = {
    '/admin/config': { status: 200, body: { data: CONFIG } },
    '/admin/backups/runs': { status: 200, body: { data: [RUN] } },
  };
  for (const [path, answer] of Object.entries(writes)) {
    routes[`POST ${path}`] = answer;
    routes[`PUT ${path}`] = answer;
  }
  return stubFetch(routes);
}

function stepUpDialog() {
  return screen.getAllByRole('dialog').find((d) => within(d).queryByLabelText('admin.users.stepUpPassword'))!;
}

function confirmStepUp(password = 'admin-pw', code = '123456') {
  const dialog = stepUpDialog();
  fireEvent.change(within(dialog).getByLabelText('admin.users.stepUpPassword'), { target: { value: password } });
  fireEvent.change(within(dialog).getByLabelText('profile.twoFactor.codeLabel'), { target: { value: code } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'actions.confirm' }));
}

/** The card named `title` (its heading). */
async function card(title: string) {
  return (await screen.findByRole('heading', { name: title })).closest('section')!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SystemConfigSection — sensitive settings ask for the step-up (#890)', () => {
  it('saves the mail server only once the admin confirmed with password and code', async () => {
    const fetchMock = stubApi({ '/admin/config/smtp': { status: 200, body: { data: CONFIG } } });
    renderWithQuery(<SystemConfigSection />);
    const email = await card('adminConfig.cards.email');
    fireEvent.change(within(email).getByLabelText('adminConfig.smtp.host'), { target: { value: 'smtp.home' } });
    fireEvent.click(within(email).getByRole('button', { name: 'adminConfig.smtp.save' }));

    expect(stepUpDialog()).toHaveTextContent('adminConfig.stepUp.smtp');
    expect(sentTo(fetchMock, '/admin/config/smtp')).toHaveLength(0);

    confirmStepUp();

    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.smtp.saved'));
    expect(sentTo(fetchMock, '/admin/config/smtp')).toEqual([
      expect.objectContaining({ smtpHost: 'smtp.home', password: 'admin-pw', code: '123456' }),
    ]);
    expect(screen.queryByLabelText('admin.users.stepUpPassword')).toBeNull();
  });

  it('says a wrong password in the dialog, which stays open, and saves nothing', async () => {
    stubApi({ '/admin/config/network': { status: 403, body: { error: 'INVALID_PASSWORD' } } });
    renderWithQuery(<SystemConfigSection />);
    const publicUrl = await card('adminConfig.cards.publicUrl');
    fireEvent.change(within(publicUrl).getByLabelText('adminConfig.network.publicUrl'), { target: { value: 'https://cave.example' } });
    fireEvent.click(within(publicUrl).getByRole('button', { name: 'adminConfig.network.save' }));
    expect(stepUpDialog()).toHaveTextContent('adminConfig.stepUp.network');

    confirmStepUp('wrong');

    expect(await within(stepUpDialog()).findByRole('alert')).toHaveTextContent('profile.passwordError');
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it.each([
    ['adminConfig.cards.email', 'adminConfig.smtp.test', 'adminConfig.stepUp.smtpTest', '/admin/config/test/smtp'],
    ['adminConfig.cards.gotify', 'adminConfig.gotify.test', 'adminConfig.stepUp.gotifyTest', '/admin/config/test/gotify'],
    ['adminConfig.cards.policy', 'adminConfig.notifPolicy.save', 'adminConfig.stepUp.notifications', '/admin/config/notifications'],
    ['adminConfig.cards.gotify', 'adminConfig.gotify.save', 'adminConfig.stepUp.gotify', '/admin/config/gotify'],
  ])('%s: %s asks for the step-up and sends it', async (title, button, message, path) => {
    const fetchMock = stubApi({ [path]: { status: 200, body: { data: path.includes('/test/') ? { success: true } : CONFIG } } });
    renderWithQuery(<SystemConfigSection />);
    fireEvent.click(within(await card(title)).getByRole('button', { name: button }));
    expect(stepUpDialog()).toHaveTextContent(message);

    confirmStepUp();

    await vi.waitFor(() => expect(sentTo(fetchMock, path)).toEqual([expect.objectContaining({ password: 'admin-pw', code: '123456' })]));
  });

  it('downloads a backup once the admin confirmed with password and code', async () => {
    const fetchMock = stubApi({ '/admin/backups/b1/download': { status: 200, body: {} } });
    // jsdom has no object URLs and does not follow a download link.
    const createObjectURL = vi.fn(() => 'blob:dump');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderWithQuery(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.history.download' }));
    expect(stepUpDialog()).toHaveTextContent('adminConfig.backup.download.body');

    confirmStepUp();

    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(click).toHaveBeenCalled();
    expect(sentTo(fetchMock, '/admin/backups/b1/download')).toEqual([{ password: 'admin-pw', code: '123456' }]);
    click.mockRestore();
  });

  it('restores after the typed keyword, then the step-up', async () => {
    const fetchMock = stubApi({ '/admin/backups/b1/restore': { status: 200, body: { data: { ok: true, safetyBackupRunId: 's' } } } });
    renderWithQuery(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.history.restore' }));
    fireEvent.change(screen.getByLabelText('adminConfig.backup.restore.keyword'), { target: { value: 'adminConfig.backup.restore.keyword' } });
    fireEvent.click(screen.getByRole('button', { name: 'adminConfig.backup.restore.confirm' }));
    expect(stepUpDialog()).toHaveTextContent('adminConfig.backup.restore.stepUp');

    confirmStepUp();

    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.backup.restore.success'));
    expect(sentTo(fetchMock, '/admin/backups/b1/restore')).toEqual([{ confirm: true, password: 'admin-pw', code: '123456' }]);
  });

  it('asks for the step-up to delete all data, then purges', async () => {
    const fetchMock = stubApi({ '/admin/maintenance/purge': { status: 200, body: { data: { counts: { items: 3, cellars: 1, auditLogs: 9 } } } } });
    renderWithQuery(<SystemConfigSection />);
    const purge = await card('admin.maintenance.purge.title');
    fireEvent.click(within(purge).getByRole('button', { name: 'admin.maintenance.purge.button' }));
    fireEvent.change(screen.getByLabelText('admin.maintenance.purge.keywordLabel'), { target: { value: 'admin.maintenance.purge.keywordValue' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'actions.confirm' }));
    expect(stepUpDialog()).toHaveTextContent('admin.maintenance.purge.stepUp');
    expect(sentTo(fetchMock, '/admin/maintenance/purge')).toHaveLength(0);

    confirmStepUp();

    expect(await within(purge).findByText('admin.maintenance.purge.success')).toBeInTheDocument();
    expect(sentTo(fetchMock, '/admin/maintenance/purge')).toEqual([{ confirmation: 'SUPPRIMER', password: 'admin-pw', code: '123456' }]);
  });
});
