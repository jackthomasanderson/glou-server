import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { NotificationPrefs } from '@/lib/config/client';

// #583: the saved list is empty by default ("all categories"), and unticking
// a chip added it to that empty list — the category the member wanted to
// turn off became the only one on.

const getNotifPrefs = vi.fn();
const updateNotifPrefs = vi.fn();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/config/client', () => ({
  configClient: {
    getNotifPrefs: () => getNotifPrefs(),
    updateNotifPrefs: (patch: Partial<NotificationPrefs>) => updateNotifPrefs(patch),
    testNotifChannel: vi.fn(),
  },
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>{children}</button>
  ),
  Input: ({ label }: { label?: string }) => <input aria-label={label} />,
  Switch: ({ 'aria-label': label }: { 'aria-label'?: string }) => <input type="checkbox" aria-label={label} />,
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Skeleton: () => <div />,
  Select: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div aria-label={label} />,
  SelectItem: () => null,
}));

import { NotificationPreferences } from '../NotificationPreferences';

const ALL = ['peak', 'temperature', 'security', 'wishlist', 'backup'];

function prefsWith(notifCategories: string[]): NotificationPrefs {
  return {
    notifInApp: false,
    notifEmail: true,
    notifWebhook: false,
    notifCategories,
    notifQuietStart: null,
    notifQuietEnd: null,
    notifLanguage: null,
    webhookUrl: null,
    policy: { smtpEnabled: true, gotifyEnabled: false, inAppEnabled: false },
  };
}

const chip = (cat: string) => screen.getByRole('button', { name: `notifications.categories.${cat}` });

async function renderWith(notifCategories: string[]) {
  getNotifPrefs.mockResolvedValue(prefsWith(notifCategories));
  render(<NotificationPreferences />);
  await screen.findByRole('button', { name: 'notifications.categories.peak' });
}

describe('NotificationPreferences categories (#583)', () => {
  beforeEach(() => {
    getNotifPrefs.mockReset();
    updateNotifPrefs.mockReset().mockResolvedValue(undefined);
  });

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
    fireEvent.click(chip('peak'));

    expect(updateNotifPrefs).not.toHaveBeenCalled();
    expect(screen.getByText('notifications.categories.lastOne')).toBeInTheDocument();
  });
});

describe('NotificationPreferences quiet hours (#575)', () => {
  it('says what happens to a message that falls in the range', async () => {
    await renderWith([]);
    expect(screen.getByText('notifications.quietHours.dropped')).toBeInTheDocument();
  });
});
