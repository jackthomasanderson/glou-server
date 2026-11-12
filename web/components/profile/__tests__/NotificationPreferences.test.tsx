import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { forwardRef, type ReactNode } from 'react';
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
    // Like HeroUI: the ref is the <input>; aria-describedby is not forwarded to it.
    Checkbox: forwardRef<HTMLInputElement, {
      children?: ReactNode; isSelected?: boolean; isDisabled?: boolean; onValueChange?: (v: boolean) => void;
    }>(function Checkbox({ children, isSelected, isDisabled, onValueChange }, ref) {
      return (
        <label>
          <input ref={ref} type="checkbox" checked={!!isSelected} disabled={isDisabled} onChange={(e) => onValueChange?.(e.target.checked)} />
          {children}
        </label>
      );
    }),
    Skeleton: () => <div />,
    Card: Box,
    CardBody: Box,
    Select: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div aria-label={label} />,
    SelectItem: () => null,
  };
});

import { NotificationPreferences, sameClock } from '../NotificationPreferences';

const ALL = ['peak', 'temperature', 'security', 'wishlist', 'backup'];

function prefs(patch: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    notifEmail: true,
    notifWebhook: false,
    notifCategories: [],
    notifQuietStart: null,
    notifQuietEnd: null,
    notifLanguage: null,
    policy: { smtpEnabled: true, gotifyEnabled: false },
    categories: ['peak', 'temperature', 'security', 'wishlist', 'backup'],
    automaticBackups: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...patch,
  };
}

function renderPrefs() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><NotificationPreferences /></QueryClientProvider>);
}

// #780: each category is a checkbox, whose state reads on its own.
const chip = (cat: string) => screen.getByRole('checkbox', { name: `notifications.categories.${cat}` });

async function renderWith(notifCategories: string[], patch: Partial<NotificationPrefs> = {}) {
  getNotifPrefs.mockResolvedValue(prefs({ notifCategories, ...patch }));
  renderPrefs();
  await screen.findByRole('checkbox', { name: 'notifications.categories.peak' });
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
    for (const cat of ALL) expect(chip(cat)).toBeChecked();
  });

  it('from the default state, unticking one category leaves all the others on', async () => {
    await renderWith([]);

    fireEvent.click(chip('backup'));

    await waitFor(() => expect(updateNotifPrefs).toHaveBeenCalledTimes(1));
    expect(updateNotifPrefs).toHaveBeenCalledWith({ notifCategories: ['peak', 'temperature', 'security', 'wishlist'] });
    expect(chip('backup')).not.toBeChecked();
    for (const cat of ['peak', 'temperature', 'security', 'wishlist']) {
      expect(chip(cat)).toBeChecked();
    }
  });

  it('ticking every category again saves an empty list', async () => {
    await renderWith(['peak', 'temperature', 'security', 'wishlist']);
    expect(chip('backup')).not.toBeChecked();

    fireEvent.click(chip('backup'));

    await waitFor(() => expect(updateNotifPrefs).toHaveBeenCalledTimes(1));
    expect(updateNotifPrefs).toHaveBeenCalledWith({ notifCategories: [] });
    for (const cat of ALL) expect(chip(cat)).toBeChecked();
  });

  it('unticks a second category without re-enabling anything', async () => {
    await renderWith(['peak', 'temperature', 'security', 'wishlist']);

    fireEvent.click(chip('wishlist'));

    await waitFor(() => expect(updateNotifPrefs).toHaveBeenCalledTimes(1));
    expect(updateNotifPrefs).toHaveBeenCalledWith({ notifCategories: ['peak', 'temperature', 'security'] });
  });

  it('unticking the last optional category keeps security alerts on', async () => {
    await renderWith(['peak', 'security']);

    fireEvent.click(chip('peak'));

    await waitFor(() => expect(updateNotifPrefs).toHaveBeenCalledWith({ notifCategories: ['security'] }));
  });
});

// #981: security alerts cannot be turned off; the screen says so, next to the
// box and in its accessible description.
describe('NotificationPreferences — security alerts are locked on (#981)', () => {
  it('shows security alerts ticked and locked, even if an earlier save removed them', async () => {
    await renderWith(['peak']);

    expect(chip('security')).toBeChecked();
    expect(chip('security')).toBeDisabled();
    fireEvent.click(chip('security'));

    expect(updateNotifPrefs).not.toHaveBeenCalled();
  });

  it('explains why, on screen and to a screen reader', async () => {
    await renderWith([]);

    expect(screen.getByText('notifications.categories.securityLocked')).toBeVisible();
    expect(chip('security')).toHaveAccessibleDescription('notifications.categories.securityLockedLead notifications.categories.securityLocked');
  });

  it('says where they go when the instance cannot send e-mail', async () => {
    await renderWith([], { policy: { smtpEnabled: false, gotifyEnabled: false } });

    expect(chip('security')).toHaveAccessibleDescription('notifications.categories.securityLockedLead notifications.categories.securityLockedNoEmail');
  });

  it('describes no other category', async () => {
    await renderWith([]);

    expect(chip('peak')).not.toHaveAccessibleDescription();
    expect(chip('peak')).not.toBeDisabled();
  });
});

describe('NotificationPreferences — categories by role (#780)', () => {
  it('does not show backup failures to a member', async () => {
    await renderWith([], { categories: ['peak', 'temperature', 'security', 'wishlist'], automaticBackups: undefined });

    expect(screen.queryByRole('checkbox', { name: 'notifications.categories.backup' })).not.toBeInTheDocument();
    for (const cat of ['peak', 'temperature', 'security', 'wishlist']) expect(chip(cat)).toBeChecked();
  });

  it('a member ticking every category they can see saves an empty list', async () => {
    await renderWith(['peak', 'temperature', 'security'], { categories: ['peak', 'temperature', 'security', 'wishlist'] });

    fireEvent.click(chip('wishlist'));

    await waitFor(() => expect(updateNotifPrefs).toHaveBeenCalledWith({ notifCategories: [] }));
  });

  it('tells an admin that only manual backups can fail while automatic ones are off', async () => {
    await renderWith([], { automaticBackups: false });

    expect(chip('backup')).toHaveAccessibleDescription('notifications.categories.backupAutomaticOff');
  });

  it('says nothing more about backups while automatic ones run', async () => {
    await renderWith([]);

    expect(screen.queryByText('notifications.categories.backupAutomaticOff')).not.toBeInTheDocument();
  });
});

describe('NotificationPreferences quiet hours (#575, #772)', () => {
  it('says what happens to a message that falls in the range, apart from the details', async () => {
    await renderWith([]);
    expect(screen.getByText('notifications.quietHours.droppedLead')).toBeInTheDocument();
    expect(screen.getByText('notifications.quietHours.dropped')).toBeInTheDocument();
    expect(screen.getByText('notifications.quietHours.detailsAdmin')).toBeInTheDocument();
  });

  it('does not tell a member about backup failures', async () => {
    await renderWith([], { categories: ['peak', 'temperature', 'security', 'wishlist'] });
    expect(screen.getByText('notifications.quietHours.details')).toBeInTheDocument();
    expect(screen.queryByText('notifications.quietHours.detailsAdmin')).not.toBeInTheDocument();
  });

  it('names the instance time zone, without a warning when the device is in it', async () => {
    await renderWith([]);
    expect(screen.getByText('notifications.quietHours.timeZone')).toBeInTheDocument();
    expect(screen.queryByText('notifications.quietHours.otherTimeZone')).not.toBeInTheDocument();
  });

  it('warns a member whose device is in another time zone', async () => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await renderWith([], { timeZone: device === 'Pacific/Kiritimati' ? 'Pacific/Pago_Pago' : 'Pacific/Kiritimati' });
    expect(screen.getByText('notifications.quietHours.otherTimeZone')).toBeInTheDocument();
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
    expect(screen.queryByRole('checkbox', { name: 'notifications.categories.peak' })).not.toBeInTheDocument();
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
  const gotifyOn = () => prefs({ notifWebhook: true, policy: { smtpEnabled: true, gotifyEnabled: true } });

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
  const allOff = { smtpEnabled: false, gotifyEnabled: false };

  it('tells an admin why, with a link to Administration', async () => {
    getNotifPrefs.mockResolvedValue(prefs({
      policy: { ...allOff, offReasons: { email: 'notConfigured', gotify: 'off' } },
    }));
    renderPrefs();

    expect(await screen.findByText('notifications.channels.offReason.email.notConfigured')).toBeInTheDocument();
    expect(screen.getByText('notifications.channels.offReason.gotify.off')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'notifications.channels.configure' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/admin');
    expect(screen.queryByText('notifications.channels.disabledByAdmin')).not.toBeInTheDocument();
  });

  it('still tells a member it was disabled by the administrator', async () => {
    getNotifPrefs.mockResolvedValue(prefs({ policy: allOff }));
    renderPrefs();

    expect(await screen.findAllByText('notifications.channels.disabledByAdmin')).toHaveLength(2);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

// #671: the "in-app" channel was a switch that delivered nothing; it is gone.
describe('NotificationPreferences — channels (#671)', () => {
  it('offers email and Gotify only, no in-app channel', async () => {
    getNotifPrefs.mockResolvedValue(prefs({ policy: { smtpEnabled: true, gotifyEnabled: true } }));
    renderPrefs();
    expect(await screen.findByText('notifications.channels.email')).toBeInTheDocument();
    expect(screen.queryByText('notifications.channels.inApp')).toBeNull();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });
});

// #772 review: zones compared at one instant hid a difference that only
// shows in summer (or winter) for half the year.
describe('sameClock (#772)', () => {
  const winter = new Date(Date.UTC(2026, 0, 20));
  it('tells apart zones that share their offset only part of the year', () => {
    expect(sameClock('UTC', 'Europe/London', winter)).toBe(false);
  });
  it('treats zones with the same clock all year as the same', () => {
    expect(sameClock('Europe/Paris', 'Europe/Brussels', winter)).toBe(true);
  });
  it('does not warn on an unknown zone name', () => {
    expect(sameClock('Not/AZone', 'Europe/Paris', winter)).toBe(true);
  });
});
