import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NotificationPrefs, NotificationPrefsPatch } from '@/lib/config/client';
import { notifyError, notifySuccess } from '@/lib/toast';

const getNotifPrefs = vi.fn();
const updateNotifPrefs = vi.fn();
const testNotifChannel = vi.fn();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/lib/config/client', () => ({
  configClient: {
    getNotifPrefs: () => getNotifPrefs(),
    updateNotifPrefs: (patch: NotificationPrefsPatch) => updateNotifPrefs(patch),
    testNotifChannel: (channel: string) => testNotifChannel(channel),
  },
}));
vi.mock('@heroui/react', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
      <button type="button" onClick={onPress}>{children}</button>
    ),
    Input: ({ label }: { label?: string }) => <input aria-label={label} />,
    Switch: ({ 'aria-label': label, isSelected, onValueChange }: { 'aria-label'?: string; isSelected?: boolean; onValueChange?: (v: boolean) => void }) => (
      <input type="checkbox" role="switch" aria-label={label} checked={!!isSelected} onChange={(e) => onValueChange?.(e.target.checked)} />
    ),
    Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    Skeleton: () => <div />,
    Card: Box,
    CardBody: Box,
    Select: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div aria-label={label} />,
    SelectItem: () => null,
  };
});

import { NotificationPreferences } from '../NotificationPreferences';

const ALL = ['peak', 'temperature', 'security', 'wishlist', 'backup'];

function prefs(patch: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    notifInApp: false,
    notifEmail: true,
    notifWebhook: false,
    notifCategories: [],
    notifQuietStart: null,
    notifQuietEnd: null,
    notifLanguage: null,
    policy: { smtpEnabled: true, gotifyEnabled: false, inAppEnabled: false },
    ...patch,
  };
}

function renderPrefs() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><NotificationPreferences /></QueryClientProvider>);
}

const chip = (cat: string) => screen.getByRole('button', { name: `notifications.categories.${cat}` });

async function renderWith(notifCategories: string[]) {
  getNotifPrefs.mockResolvedValue(prefs({ notifCategories }));
  renderPrefs();
  await screen.findByRole('button', { name: 'notifications.categories.peak' });
}

beforeEach(() => {
  vi.clearAllMocks();
  getNotifPrefs.mockReset();
  updateNotifPrefs.mockReset().mockResolvedValue(undefined);
  testNotifChannel.mockReset();
});

// #583: the saved list is empty by default ("all categories"), and unticking
// a chip added it to that empty list — the category the member wanted to
// turn off became the only one on.
describe('NotificationPreferences categories (#583)', () => {
  it('shows every category on by default (empty saved list)', async () => {
    await renderWith([]);
    for (const cat of ALL) expect(chip(cat)).toHaveAttribute('aria-pressed', 'true');
  });

  it('from the default state, unticking one category leaves all the others on', async () => {
    await renderWith([]);

    fireEvent.click(chip('backup'));

    await waitFor(() => expect(updateNotifPrefs).toHaveBeenCalledTimes(1));
    expect(updateNotifPrefs).toHaveBeenCalledWith({ notifCategories: ['peak', 'temperature', 'security', 'wishlist'] });
    expect(chip('backup')).toHaveAttribute('aria-pressed', 'false');
    for (const cat of ['peak', 'temperature', 'security', 'wishlist']) {
      expect(chip(cat)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('ticking every category again saves an empty list', async () => {
    await renderWith(['peak', 'temperature', 'security', 'wishlist']);
    expect(chip('backup')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip('backup'));

    await waitFor(() => expect(updateNotifPrefs).toHaveBeenCalledTimes(1));
    expect(updateNotifPrefs).toHaveBeenCalledWith({ notifCategories: [] });
    for (const cat of ALL) expect(chip(cat)).toHaveAttribute('aria-pressed', 'true');
  });

  it('unticks a second category without re-enabling anything', async () => {
    await renderWith(['peak', 'temperature', 'security', 'wishlist']);

    fireEvent.click(chip('wishlist'));

    await waitFor(() => expect(updateNotifPrefs).toHaveBeenCalledTimes(1));
    expect(updateNotifPrefs).toHaveBeenCalledWith({ notifCategories: ['peak', 'temperature', 'security'] });
  });

  it('the last category on cannot be unticked, since an empty list means all', async () => {
    await renderWith(['peak']);

    expect(chip('peak')).toBeDisabled();
    expect(chip('peak')).toHaveAccessibleDescription('notifications.categories.lastOne');
    fireEvent.click(chip('peak'));

    expect(updateNotifPrefs).not.toHaveBeenCalled();
  });
});

describe('NotificationPreferences quiet hours (#575)', () => {
  it('says what happens to a message that falls in the range', async () => {
    await renderWith([]);
    expect(screen.getByText('notifications.quietHours.dropped')).toBeInTheDocument();
  });
});

// #615: when the preferences could not be read, the section vanished; it
// must say so and offer a retry, never show settings it did not read.
describe('NotificationPreferences when loading fails (#615)', () => {
  it('shows an error with Retry and no setting', async () => {
    getNotifPrefs.mockRejectedValue(new Error('INTERNAL_SERVER_ERROR'));
    renderPrefs();

    expect(await screen.findByText('notifications.loadError')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'notifications.categories.peak' })).not.toBeInTheDocument();
  });

  it('shows the real settings once Retry succeeds', async () => {
    getNotifPrefs.mockRejectedValueOnce(new Error('INTERNAL_SERVER_ERROR')).mockResolvedValue(prefs());
    renderPrefs();

    fireEvent.click(await screen.findByRole('button', { name: 'status.retry' }));

    expect(await screen.findByRole('switch', { name: 'notifications.channels.email' })).toBeChecked();
  });

  it('a refused save puts the saved value back and says so in words', async () => {
    getNotifPrefs.mockResolvedValue(prefs());
    updateNotifPrefs.mockRejectedValue(new Error('INTERNAL_SERVER_ERROR'));
    renderPrefs();
    const email = await screen.findByRole('switch', { name: 'notifications.channels.email' });

    fireEvent.click(email);

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('notifications.saveError'));
    expect(updateNotifPrefs).toHaveBeenCalledWith({ notifEmail: false });
    expect(screen.getByRole('switch', { name: 'notifications.channels.email' })).toBeChecked();
  });
});

// #767: Gotify messages go to the instance's server; the member only opts in.
describe('NotificationPreferences — Gotify (#767)', () => {
  const gotifyOn = () => prefs({ notifWebhook: true, policy: { smtpEnabled: true, gotifyEnabled: true, inAppEnabled: false } });

  it('has no address field, and says where the messages go', async () => {
    getNotifPrefs.mockResolvedValue(gotifyOn());
    renderPrefs();

    await screen.findByRole('switch', { name: 'notifications.channels.webhook' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('notifications.channels.webhookDesc')).toBeInTheDocument();
  });

  it.each([
    ['DELIVERY_FAILED', 'notifications.channels.testErrors.DELIVERY_FAILED'],
    ['GOTIFY_NOT_CONFIGURED', 'notifications.channels.testErrors.GOTIFY_NOT_CONFIGURED'],
    ['INVALID_URL', 'notifications.channels.testErrors.INVALID_URL'],
    ['connect ECONNREFUSED 10.0.0.5:8080', 'notifications.channels.testErrors.UNEXPECTED'],
  ])('a failed test answered %s reads as a sentence', async (code, key) => {
    getNotifPrefs.mockResolvedValue(gotifyOn());
    testNotifChannel.mockResolvedValue({ success: false, error: code });
    renderPrefs();
    await screen.findByRole('switch', { name: 'notifications.channels.webhook' });

    fireEvent.click(screen.getAllByRole('button', { name: 'notifications.channels.test' })[1]);

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(key));
    expect(testNotifChannel).toHaveBeenCalledWith('webhook');
  });

  it('a throttled test says how long to wait', async () => {
    getNotifPrefs.mockResolvedValue(gotifyOn());
    testNotifChannel.mockRejectedValue(Object.assign(new Error('TOO_MANY_REQUESTS'), { retryAfter: 600 }));
    renderPrefs();
    await screen.findByRole('switch', { name: 'notifications.channels.webhook' });

    fireEvent.click(screen.getAllByRole('button', { name: 'notifications.channels.test' })[1]);

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('notifications.channels.testErrors.TOO_MANY_REQUESTS', { count: 10 }));
  });

  it('a successful test says so', async () => {
    getNotifPrefs.mockResolvedValue(gotifyOn());
    testNotifChannel.mockResolvedValue({ success: true });
    renderPrefs();
    await screen.findByRole('switch', { name: 'notifications.channels.webhook' });

    fireEvent.click(screen.getAllByRole('button', { name: 'notifications.channels.test' })[1]);

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('notifications.channels.testSuccess'));
  });
});

// #775: "Disabled by the administrator" told the administrator nothing.
describe('NotificationPreferences — a channel that is not available (#775)', () => {
  const allOff = { smtpEnabled: false, gotifyEnabled: false, inAppEnabled: false };

  it('tells an admin why, with a link to Administration', async () => {
    getNotifPrefs.mockResolvedValue(prefs({
      policy: { ...allOff, offReasons: { email: 'notConfigured', gotify: 'off', inApp: 'off' } },
    }));
    renderPrefs();

    expect(await screen.findByText('notifications.channels.offReason.email.notConfigured')).toBeInTheDocument();
    expect(screen.getByText('notifications.channels.offReason.gotify.off')).toBeInTheDocument();
    expect(screen.getByText('notifications.channels.offReason.inApp.off')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'notifications.channels.configure' });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute('href', '/admin');
    expect(screen.queryByText('notifications.channels.disabledByAdmin')).not.toBeInTheDocument();
  });

  it('still tells a member it was disabled by the administrator', async () => {
    getNotifPrefs.mockResolvedValue(prefs({ policy: allOff }));
    renderPrefs();

    expect(await screen.findAllByText('notifications.channels.disabledByAdmin')).toHaveLength(3);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
