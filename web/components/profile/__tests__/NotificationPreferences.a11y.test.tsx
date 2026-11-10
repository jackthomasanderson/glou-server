import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NotificationPrefs } from '@/lib/config/client';

// #780 review: rendered with the real HeroUI Checkbox, which does not forward
// aria-describedby to its <input>; the reasons must still describe the box.
const getNotifPrefs = vi.fn();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/lib/config/client', () => ({
  configClient: { getNotifPrefs: () => getNotifPrefs(), updateNotifPrefs: vi.fn(), testNotifChannel: vi.fn() },
}));

import { NotificationPreferences } from '../NotificationPreferences';

function prefs(patch: Partial<NotificationPrefs>): NotificationPrefs {
  return {
    notifEmail: true, notifWebhook: false, notifCategories: [],
    notifQuietStart: null, notifQuietEnd: null, notifLanguage: null,
    policy: { smtpEnabled: true, gotifyEnabled: false },
    categories: ['peak', 'temperature', 'security', 'wishlist', 'backup'],
    automaticBackups: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...patch,
  };
}

async function renderWith(patch: Partial<NotificationPrefs>) {
  getNotifPrefs.mockResolvedValue(prefs(patch));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><NotificationPreferences /></QueryClientProvider>);
  await screen.findByRole('checkbox', { name: 'notifications.categories.peak' });
}

beforeEach(() => getNotifPrefs.mockReset());

describe('NotificationPreferences category checkboxes, real HeroUI (#780)', () => {
  it('the last category on is described by why it cannot be unticked', async () => {
    await renderWith({ notifCategories: ['peak'] });
    const peak = screen.getByRole('checkbox', { name: 'notifications.categories.peak' });
    expect(peak).toBeDisabled();
    expect(peak).toHaveAccessibleDescription('notifications.categories.lastOne');
  });

  it('the backup category is described by why it matters less without automatic backups', async () => {
    await renderWith({ automaticBackups: false });
    expect(screen.getByRole('checkbox', { name: 'notifications.categories.backup' }))
      .toHaveAccessibleDescription('notifications.categories.backupAutomaticOff');
    expect(screen.getByRole('checkbox', { name: 'notifications.categories.peak' })).not.toHaveAccessibleDescription();
  });
});
