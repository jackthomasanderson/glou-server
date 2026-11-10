import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, within, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { notifyError } from '@/lib/toast';
import { renderWithQuery, stubFetch, CONFIG, type Answer } from './configTestKit';

// #757: four tabs named after a task instead of nine technical ones.
// #615: a configuration that could not be read shows an error with Retry,
// never forms filled with made-up defaults that a Save would write back.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useScan', () => ({ useScanStatus: () => ({ data: { available: false } }) }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: { id: 'a1', isTwoFactorEnabled: false }, refetch: () => {} }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async () => (await import('./configTestKit')).heroUiMock());

import { SystemConfigSection } from '../SystemConfigSection';

const OK_CONFIG = { status: 200, body: { data: CONFIG } };

/** The tab whose title is `title`: its title and panel (the test HeroUI renders every tab). */
const tab = (title: string) => screen.getByText(title).closest('section')!;
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SystemConfigSection — four tabs by task (#757)', () => {
  it('has the Notifications, Access, Data and System tabs, and no other', async () => {
    stubFetch({ '/admin/config': OK_CONFIG });
    renderWithQuery(<SystemConfigSection />);
    await screen.findByText('adminConfig.tabs.notifications');
    const titles = Array.from(document.querySelectorAll('section > span')).map((s) => s.textContent);
    expect(titles).toEqual(['adminConfig.tabs.notifications', 'adminConfig.tabs.access', 'adminConfig.tabs.data', 'adminConfig.tabs.system']);
  });

  it('puts sign-up under its own heading, with no network check under it', async () => {
    stubFetch({ '/admin/config': OK_CONFIG });
    renderWithQuery(<SystemConfigSection />);
    await screen.findByText('adminConfig.tabs.access');
    const signUp = card('adminConfig.registration.title');
    expect(tab('adminConfig.tabs.access')).toContainElement(signUp);
    expect(within(signUp).getByText('adminConfig.registration.enabled')).toBeInTheDocument();
    expect(within(signUp).queryByRole('button', { name: 'adminConfig.network.check.button' })).toBeNull();
    expect(within(card('adminConfig.cards.publicUrl')).getByRole('button', { name: 'adminConfig.network.check.button' })).toBeInTheDocument();
  });

  it('puts the purge next to the backups, and the label scanning status in System', async () => {
    stubFetch({ '/admin/config': OK_CONFIG });
    renderWithQuery(<SystemConfigSection />);
    await screen.findByText('adminConfig.tabs.data');
    const data = tab('adminConfig.tabs.data');
    expect(data).toContainElement(card('adminConfig.cards.backups'));
    expect(data).toContainElement(card('admin.maintenance.purge.title'));
    const system = tab('adminConfig.tabs.system');
    expect(system).toContainElement(card('adminConfig.scan.title'));
    expect(system).toContainElement(card('adminConfig.version.title'));
    expect(system).toContainElement(card('adminConfig.cards.history'));
  });
});

describe('SystemConfigSection — a configuration that cannot be read (#615)', () => {
  it('shows an error with Retry and no form, then the forms once Retry works', async () => {
    let configAnswer: Answer = { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
    stubFetch({ '/admin/config': () => configAnswer });
    renderWithQuery(<SystemConfigSection />);

    expect(await screen.findByText('adminConfig.loadError')).toBeInTheDocument();
    expect(screen.queryByText('adminConfig.backup.enabled')).toBeNull();
    expect(screen.queryByRole('button', { name: 'adminConfig.save' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();

    configAnswer = OK_CONFIG;
    fireEvent.click(screen.getByRole('button', { name: 'status.retry' }));

    expect(await screen.findByText('adminConfig.backup.enabled')).toBeInTheDocument();
    expect(screen.queryByText('adminConfig.loadError')).toBeNull();
  });

  it('keeps the forms, and what was typed, when a later reload of the configuration fails', async () => {
    let configAnswer: Answer = OK_CONFIG;
    stubFetch({ '/admin/config': () => configAnswer });
    const { queryClient } = renderWithQuery(<SystemConfigSection />);
    const retention = (await screen.findByRole('heading', { name: 'adminConfig.cards.retention' })).closest('section')!;
    fireEvent.change(within(retention).getByLabelText('adminConfig.retention.fields.logRetentionDays'), { target: { value: '365' } });

    configAnswer = { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
    await act(() => queryClient.refetchQueries());
    await vi.waitFor(() => expect(queryClient.getQueryState(['admin_system_config'])?.status).toBe('error'));

    expect(screen.queryByText('adminConfig.loadError')).toBeNull();
    expect(within(retention).getByLabelText('adminConfig.retention.fields.logRetentionDays')).toHaveValue('365');
  });

  it('starts the backup form from the saved values', async () => {
    stubFetch({ '/admin/config': OK_CONFIG });
    renderWithQuery(<SystemConfigSection />);
    const backups = await screen.findByRole('heading', { name: 'adminConfig.cards.backups' });
    const section = backups.closest('section')!;
    expect(within(section).getByRole('switch')).toBeChecked();
    expect(within(section).getByLabelText('adminConfig.backup.retentionDays')).toHaveValue('7');
  });

  it('says a history it could not read, instead of "nothing recorded"', async () => {
    stubFetch({ '/admin/config': OK_CONFIG });
    renderWithQuery(<SystemConfigSection />);
    await screen.findByText('adminConfig.tabs.data');
    await vi.waitFor(() => expect(screen.getAllByText('adminConfig.listLoadError')).toHaveLength(3));
    expect(screen.queryByText('adminConfig.backup.history.noHistory')).toBeNull();
    expect(screen.queryByText('adminConfig.retention.history.noHistory')).toBeNull();
    expect(screen.queryByText('adminConfig.history.noHistory')).toBeNull();
  });

  it('says a refused save in words, never the raw code', async () => {
    stubFetch({ '/admin/config': OK_CONFIG, 'PUT /admin/config/retention': { status: 400, body: { error: 'VALIDATION_ERROR' } } });
    renderWithQuery(<SystemConfigSection />);
    const retention = (await screen.findByRole('heading', { name: 'adminConfig.cards.retention' })).closest('section')!;
    fireEvent.change(within(retention).getByLabelText('adminConfig.retention.fields.logRetentionDays'), { target: { value: '0' } });
    fireEvent.click(within(retention).getByRole('button', { name: 'adminConfig.save' }));

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.errors.VALIDATION_ERROR'));
  });
});
