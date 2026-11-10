import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { notifyError, notifySuccess } from '@/lib/toast';
import { renderWithQuery, stubFetch, sentTo, CONFIG, type Answer } from './configTestKit';

// #893: lowering a retention, turning backups off or opening sign-up asks for
// the admin's step-up; the safe direction of the same settings does not.
// #748: "Back up now" waits as long as a restore and says when it is still
// running. #761: the backup hour is an hour of the server's time zone, named
// next to the field. Only fetch is stubbed: the real config client runs.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.timeZone ? `${k} ${String(o.timeZone)}` : k),
    i18n: { language: 'en' },
  }),
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

const SERVER_CONFIG = { ...CONFIG, timeZone: 'Europe/Paris' };

/** GETs answer the config; `writes` answers the PUT and POST calls by path. */
function stubApi(writes: Record<string, Answer | (() => Answer)>) {
  const routes: Record<string, Answer | (() => Answer)> = {
    '/admin/config': { status: 200, body: { data: SERVER_CONFIG } },
    '/admin/backups/runs': { status: 200, body: { data: [] } },
    '/admin/maintenance/runs': { status: 200, body: { data: [] } },
  };
  for (const [path, answer] of Object.entries(writes)) {
    routes[`POST ${path}`] = answer;
    routes[`PUT ${path}`] = answer;
  }
  return stubFetch(routes);
}

const saved = { status: 200, body: { data: SERVER_CONFIG } };

function stepUpDialog() {
  return screen.queryAllByRole('dialog').find((d) => within(d).queryByLabelText('admin.users.stepUpPassword'));
}

function confirmStepUp() {
  const dialog = stepUpDialog()!;
  fireEvent.change(within(dialog).getByLabelText('admin.users.stepUpPassword'), { target: { value: 'admin-pw' } });
  fireEvent.change(within(dialog).getByLabelText('profile.twoFactor.codeLabel'), { target: { value: '123456' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'actions.confirm' }));
}

async function card(title: string) {
  return (await screen.findByRole('heading', { name: title })).closest('section')!;
}

const save = (section: HTMLElement) => fireEvent.click(within(section).getByRole('button', { name: 'adminConfig.save' }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Data and access settings that erase data or let anyone in ask for the step-up (#893)', () => {
  it.each([
    ['a shorter audit log retention', 'adminConfig.cards.retention', '/admin/config/retention', 'adminConfig.stepUp.retention',
      (c: HTMLElement) => fireEvent.change(within(c).getByLabelText('adminConfig.retention.fields.logRetentionDays'), { target: { value: '1' } }),
      { logRetentionDays: 1 }],
    ['turning backups off', 'adminConfig.cards.backups', '/admin/config/backup', 'adminConfig.stepUp.backup',
      (c: HTMLElement) => fireEvent.click(within(c).getByRole('switch')),
      { backupEnabled: false }],
    ['a shorter backup retention', 'adminConfig.cards.backups', '/admin/config/backup', 'adminConfig.stepUp.backup',
      (c: HTMLElement) => fireEvent.change(within(c).getByLabelText('adminConfig.backup.retentionDays'), { target: { value: '3' } }),
      { backupRetentionDays: 3 }],
    ['opening sign-up', 'adminConfig.registration.title', '/admin/config/registration', 'adminConfig.stepUp.registration',
      (c: HTMLElement) => fireEvent.click(within(c).getByRole('switch')),
      { registrationOpen: true }],
  ])('%s is saved once the admin confirmed with password and code', async (_label, title, path, message, edit, expected) => {
    const fetchMock = stubApi({ [path]: saved });
    renderWithQuery(<SystemConfigSection />);
    const section = await card(title);
    edit(section);
    save(section);

    expect(stepUpDialog()).toHaveTextContent(message);
    expect(sentTo(fetchMock, path)).toHaveLength(0);

    confirmStepUp();

    await vi.waitFor(() => expect(sentTo(fetchMock, path)).toEqual([
      expect.objectContaining({ ...expected, password: 'admin-pw', code: '123456' }),
    ]));
    await vi.waitFor(() => expect(stepUpDialog()).toBeUndefined());
  });

  it.each([
    ['a longer retention', 'adminConfig.cards.retention', '/admin/config/retention',
      (c: HTMLElement) => fireEvent.change(within(c).getByLabelText('adminConfig.retention.fields.logRetentionDays'), { target: { value: '365' } })],
    ['a longer backup retention', 'adminConfig.cards.backups', '/admin/config/backup',
      (c: HTMLElement) => fireEvent.change(within(c).getByLabelText('adminConfig.backup.retentionDays'), { target: { value: '30' } })],
  ])('%s is saved with the session alone', async (_label, title, path, edit) => {
    const fetchMock = stubApi({ [path]: saved });
    renderWithQuery(<SystemConfigSection />);
    const section = await card(title);
    edit(section);
    save(section);

    await vi.waitFor(() => expect(sentTo(fetchMock, path)).toHaveLength(1));
    expect(sentTo(fetchMock, path)[0]).not.toHaveProperty('password');
    expect(stepUpDialog()).toBeUndefined();
  });

  it('asks for the step-up when the server does, e.g. after another admin changed the value', async () => {
    let calls = 0;
    const fetchMock = stubApi({
      '/admin/config/retention': () => (++calls === 1 ? { status: 403, body: { error: 'REAUTH_REQUIRED' } } : saved),
    });
    renderWithQuery(<SystemConfigSection />);
    const section = await card('adminConfig.cards.retention');
    fireEvent.change(within(section).getByLabelText('adminConfig.retention.fields.logRetentionDays'), { target: { value: '365' } });
    save(section);

    await vi.waitFor(() => expect(stepUpDialog()).toHaveTextContent('adminConfig.stepUp.retention'));
    expect(notifyError).not.toHaveBeenCalled();

    confirmStepUp();

    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.retention.saved'));
    expect(sentTo(fetchMock, '/admin/config/retention')[1]).toMatchObject({ logRetentionDays: 365, password: 'admin-pw' });
  });
});

describe('Back up now (#748)', () => {
  it('waits as long as a restore, not the usual 15 s', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    stubApi({ '/admin/backups/run': { status: 200, body: { data: { id: 'b2', success: true } } } });
    renderWithQuery(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.runNow.button' }));

    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.backup.runNow.success'));
    expect(timeout).toHaveBeenCalledWith(75_000);
  });

  it('says the backup is still running on the server when the browser stops waiting', async () => {
    stubApi({
      '/admin/backups/run': () => { throw new DOMException('The operation timed out.', 'TimeoutError'); },
    });
    renderWithQuery(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.runNow.button' }));

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.backup.runNow.timeout'));
  });
});

describe('Restore of a file no longer on disk (#748)', () => {
  it('is explained in words', async () => {
    const RUN = {
      id: 'b1', runAt: '2026-10-27T03:00:00.000Z', trigger: 'scheduled', userId: null, success: true,
      filePath: '/app/backups/b1.sql.gz', fileSizeBytes: 2048, error: null, durationMs: 120,
    };
    stubFetch({
      '/admin/config': { status: 200, body: { data: SERVER_CONFIG } },
      '/admin/backups/runs': { status: 200, body: { data: [RUN] } },
      'POST /admin/backups/b1/restore': { status: 404, body: { error: 'BACKUP_FILE_MISSING' } },
    });
    renderWithQuery(<SystemConfigSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'adminConfig.backup.history.restore' }));
    fireEvent.change(screen.getByLabelText('adminConfig.backup.restore.keyword'), { target: { value: 'adminConfig.backup.restore.keyword' } });
    fireEvent.click(screen.getByRole('button', { name: 'adminConfig.backup.restore.confirm' }));
    confirmStepUp();

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.backup.restore.errors.BACKUP_FILE_MISSING'));
  });
});

describe('Backup hour (#761)', () => {
  it('is an hour of the server time zone, named next to the field, never UTC', async () => {
    stubApi({});
    renderWithQuery(<SystemConfigSection />);
    const section = await card('adminConfig.cards.backups');

    expect(section).toHaveTextContent('adminConfig.backup.hour');
    expect(section).toHaveTextContent('adminConfig.backup.hourHint Europe/Paris');
    expect(section.textContent).not.toMatch(/utc/i);
  });

  it('sends the hour as backupHour', async () => {
    const fetchMock = stubApi({ '/admin/config/backup': saved });
    renderWithQuery(<SystemConfigSection />);
    const section = await card('adminConfig.cards.backups');
    fireEvent.change(within(section).getByLabelText('adminConfig.backup.retentionDays'), { target: { value: '30' } });
    save(section);

    await vi.waitFor(() => expect(sentTo(fetchMock, '/admin/config/backup')).toEqual([
      { backupEnabled: true, backupRetentionDays: 30, backupHour: 3 },
    ]));
  });
});
