import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';

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
// The admin has 2FA on: the dialog asks for a code too.
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'a1', isTwoFactorEnabled: true }, refetch: vi.fn() }),
}));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
// Every tab's content is rendered at once, so no tab needs a click.
vi.mock('@heroui/react', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, onPress, isDisabled, 'aria-label': ariaLabel }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean; 'aria-label'?: string }) => (
      <button type="button" aria-label={ariaLabel} onClick={onPress} disabled={isDisabled}>{children}</button>
    ),
    Input: ({ label, placeholder, value, onValueChange }: { label?: string; placeholder?: string; value?: string; onValueChange?: (v: string) => void }) => (
      <input aria-label={label ?? placeholder} value={value ?? ''} onChange={(e) => onValueChange?.(e.target.value)} />
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

const CONFIG = {
  smtpEnabled: true, smtpHost: 'mail.home', smtpPort: 587, smtpUser: null, smtpPassMasked: null, smtpFrom: null, smtpSecure: true,
  gotifyEnabled: false, gotifyUrl: null, gotifyTokenMasked: null, inAppEnabled: true,
  logRetentionDays: 90, sessionRetentionDays: 30, guestShareRetentionDays: 30,
  publicUrl: null, accessMode: 'direct', effectivePublicUrl: 'http://localhost:3000',
  registrationOpen: false, backupEnabled: true, backupRetentionDays: 7, backupHourUtc: 3,
};
const RUN = {
  id: 'b1', runAt: '2026-10-27T03:00:00.000Z', trigger: 'scheduled', userId: null, success: true,
  filePath: '/app/backups/b1.sql.gz', fileSizeBytes: 2048, error: null, durationMs: 120,
};

type Answer = { status: number; body: unknown };

/** GETs answer the config and one backup; `writes` answers the gated calls by path. */
function stubApi(writes: Record<string, Answer>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api/, '');
    let answer: Answer = { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
    if (!init?.method || init.method === 'GET') {
      if (path === '/admin/config') answer = { status: 200, body: { data: CONFIG } };
      if (path === '/admin/backups/runs') answer = { status: 200, body: { data: [RUN] } };
    } else if (writes[path]) {
      answer = writes[path];
    }
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      headers: new Headers(),
      json: async () => answer.body,
      blob: async () => new Blob(['dump']),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof stubApi>, path: string) =>
  fetchMock.mock.calls
    .filter(([u, init]) => String(u).endsWith(`/api${path}`) && init?.method && init.method !== 'GET')
    .map(([, init]) => JSON.parse(String(init!.body)));

function stepUpDialog() {
  return screen.getAllByRole('dialog').find((d) => within(d).queryByLabelText('admin.users.stepUpPassword'))!;
}

function confirmStepUp(password = 'admin-pw', code = '123456') {
  const dialog = stepUpDialog();
  fireEvent.change(within(dialog).getByLabelText('admin.users.stepUpPassword'), { target: { value: password } });
  fireEvent.change(within(dialog).getByLabelText('profile.twoFactor.codeLabel'), { target: { value: code } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'actions.confirm' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SystemConfigSection — sensitive settings ask for the step-up (#890)', () => {
  it('saves the mail server only once the admin confirmed with password and code', async () => {
    const fetchMock = stubApi({ '/admin/config/smtp': { status: 200, body: { data: CONFIG } } });
    render(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.smtp.save' }));

    expect(stepUpDialog()).toHaveTextContent('adminConfig.stepUp.smtp');
    expect(sent(fetchMock, '/admin/config/smtp')).toHaveLength(0);

    confirmStepUp();

    expect(await screen.findByText('adminConfig.smtp.saved')).toBeInTheDocument();
    expect(sent(fetchMock, '/admin/config/smtp')).toEqual([
      expect.objectContaining({ smtpHost: 'mail.home', password: 'admin-pw', code: '123456' }),
    ]);
    expect(screen.queryByLabelText('admin.users.stepUpPassword')).toBeNull();
  });

  it('says a wrong password in the dialog, which stays open, and saves nothing', async () => {
    stubApi({ '/admin/config/network': { status: 403, body: { error: 'INVALID_PASSWORD' } } });
    render(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.network.save' }));
    expect(stepUpDialog()).toHaveTextContent('adminConfig.stepUp.network');

    confirmStepUp('wrong');

    expect(await within(stepUpDialog()).findByRole('alert')).toHaveTextContent('profile.passwordError');
    expect(screen.queryByText('adminConfig.network.saved')).toBeNull();
  });

  it.each([
    ['adminConfig.smtp.test', 'adminConfig.stepUp.smtpTest', '/admin/config/test/smtp'],
    ['adminConfig.notifPolicy.save', 'adminConfig.stepUp.notifications', '/admin/config/notifications'],
    ['adminConfig.gotify.save', 'adminConfig.stepUp.gotify', '/admin/config/gotify'],
    ['adminConfig.gotify.test', 'adminConfig.stepUp.gotifyTest', '/admin/config/test/gotify'],
  ])('%s asks for the step-up and sends it', async (button, message, path) => {
    const fetchMock = stubApi({ [path]: { status: 200, body: { data: path.includes('/test/') ? { success: true } : CONFIG } } });
    render(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: button }));
    expect(stepUpDialog()).toHaveTextContent(message);

    confirmStepUp();

    await vi.waitFor(() => expect(sent(fetchMock, path)).toEqual([expect.objectContaining({ password: 'admin-pw', code: '123456' })]));
  });

  it('downloads a backup once the admin confirmed with password and code', async () => {
    const fetchMock = stubApi({ '/admin/backups/b1/download': { status: 200, body: {} } });
    // jsdom has no object URLs and does not follow a download link.
    const createObjectURL = vi.fn(() => 'blob:dump');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.history.download' }));
    expect(stepUpDialog()).toHaveTextContent('adminConfig.backup.download.body');

    confirmStepUp();

    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(click).toHaveBeenCalled();
    expect(sent(fetchMock, '/admin/backups/b1/download')).toEqual([{ password: 'admin-pw', code: '123456' }]);
    click.mockRestore();
  });

  it('restores after the typed keyword, then the step-up', async () => {
    const fetchMock = stubApi({ '/admin/backups/b1/restore': { status: 200, body: { data: { ok: true, safetyBackupRunId: 's' } } } });
    render(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.history.restore' }));
    fireEvent.change(screen.getByLabelText('adminConfig.backup.restore.keyword'), { target: { value: 'adminConfig.backup.restore.keyword' } });
    fireEvent.click(screen.getByRole('button', { name: 'adminConfig.backup.restore.confirm' }));
    expect(stepUpDialog()).toHaveTextContent('adminConfig.backup.restore.stepUp');

    confirmStepUp();

    expect(await screen.findByText('adminConfig.backup.restore.success')).toBeInTheDocument();
    expect(sent(fetchMock, '/admin/backups/b1/restore')).toEqual([{ confirm: true, password: 'admin-pw', code: '123456' }]);
  });
});
