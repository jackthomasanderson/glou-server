import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

// #1042: the "profile saved" toast follows the language that was just chosen.

const order: string[] = [];
const changeLanguage = vi.fn(async (lang: string) => { order.push(`lang:${lang}`); });
const notifySuccess = vi.fn(() => { order.push('toast'); });
let onSelectionChange: Record<string, (keys: Set<string>) => void> = {};

const t = (k: string) => k;
const user = { id: 'u1', isAdmin: false, language: 'FR', theme: 'SYSTEM' };

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t, i18n: { language: 'fr', changeLanguage: (l: string) => changeLanguage(l) } }) }));
vi.mock('next/link', () => ({ default: ({ children }: { children?: ReactNode }) => <a>{children}</a> }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: user, isLoading: false }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePreferences: () => ({ mutate: (_p: unknown, o: { onSuccess: () => void }) => o.onSuccess(), isPending: false }),
}));
vi.mock('@/lib/toast', () => ({ notifySuccess: () => notifySuccess() }));
vi.mock('@/components/ui/MainLayout', () => ({ MainLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ui/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/ui/SingleSelect', () => ({
  SingleSelect: (props: { label: string; onSelectionChange: (keys: Set<string>) => void }) => {
    onSelectionChange[props.label] = props.onSelectionChange;
    return null;
  },
}));
vi.mock('@/components/profile/TwoFactorSettings', () => ({ TwoFactorSettings: () => null }));
vi.mock('@/components/profile/AccountSecurity', () => ({ AccountSecurity: () => null }));
vi.mock('@/components/profile/SessionsPanel', () => ({ SessionsPanel: () => null }));
vi.mock('@/components/profile/AvatarUploader', () => ({ AvatarUploader: () => null }));
vi.mock('@/components/profile/GdprSection', () => ({ GdprSection: () => null }));
vi.mock('@/components/shares/SharesDashboard', () => ({ SharesDashboard: () => null }));
vi.mock('@/components/profile/NotificationPreferences', () => ({ NotificationPreferences: () => null }));
vi.mock('@/components/profile/AppVersion', () => ({ AppVersion: () => null }));
vi.mock('@heroui/react', () => ({
  Button: () => null, Input: () => null, SelectItem: () => null, Switch: () => null, CircularProgress: () => null,
}));

import { ProfileClient } from '../ProfileClient';

describe('ProfileClient language change', () => {
  beforeEach(() => { order.length = 0; onSelectionChange = {}; vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn(); });

  it('switches the interface language before showing the saved toast', async () => {
    render(<ProfileClient />);
    onSelectionChange['profile.language'](new Set(['EN']));
    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    expect(order).toEqual(['lang:en', 'toast']);
  });

  it('leaves the language alone when another preference changes', async () => {
    render(<ProfileClient />);
    onSelectionChange['profile.tempUnit'](new Set(['F']));
    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    expect(changeLanguage).not.toHaveBeenCalled();
  });
});
