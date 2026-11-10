import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import en from '../../../public/locales/en/common.json';
import type { AdminUser } from '@/hooks/useAdmin';

// #698: the admin page shows one section at a time, each reachable from the
// section list; a member's status reads as text, apart from its action.
// #756: a backup problem is said at the top and opens the Data tab (backups).
// #757: the purge lives in System configuration → Data; the Members block says
// whether sign-up is open, with the way to the Access tab.

let i18n: I18n;
let isMobile = false;
let health: { directoryWritable: boolean; backupEnabled: boolean; lastSuccessAt: string | null; lastRunFailed?: boolean; overdue?: boolean } | undefined;
let systemConfig: { registrationOpen: boolean } | undefined;
const users: AdminUser[] = [
  { id: 'a1', username: 'admin', email: 'admin@example.com', displayName: null, isAdmin: true, isActive: true, isTwoFactorEnabled: false, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u2', username: 'bob', email: 'bob@example.com', displayName: null, isAdmin: false, isActive: false, isTwoFactorEnabled: false, createdAt: '2026-02-01T00:00:00.000Z' },
];

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: unknown) => string)(k, o),
    i18n: { language: 'en' },
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => isMobile }));
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: { id: 'a1', isAdmin: true }, isLoading: false }) }));
vi.mock('@/hooks/useAdmin', () => ({
  useAdminUsers: () => ({ data: users, isLoading: false }),
  useUpdateUserRole: () => ({ mutate: vi.fn() }),
  useUpdateUserStatus: () => ({ mutate: vi.fn() }),
  useAdminBackupHealth: () => ({ data: health, refetch: vi.fn() }),
  useSystemConfig: () => ({ data: systemConfig }),
}));
vi.mock('@/components/ui/MainLayout', () => ({ MainLayout: ({ children }: { children?: ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: () => null }));
vi.mock('@/components/admin/GrantAdminDialog', () => ({ GrantAdminDialog: () => null }));
vi.mock('@/components/admin/ResetPasswordDialog', () => ({ ResetPasswordDialog: () => null }));
vi.mock('@/components/admin/MaturityReferencesSection', () => ({ MaturityReferencesSection: () => <section>maturity-section</section> }));
vi.mock('@/components/admin/AdminSharesSection', () => ({ AdminSharesSection: () => <section>shares-section</section> }));
vi.mock('@/components/admin/AuditLogSection', () => ({ AuditLogSection: () => <section>audit-section</section> }));
// A form with its own state, like the real settings forms.
vi.mock('@/components/admin/SystemConfigSection', async () => {
  const { useState } = await import('react');
  return {
    SystemConfigSection: ({ selectedTab }: { selectedTab?: string }) => {
      const [host, setHost] = useState('');
      return <section>config-section:{selectedTab}<input aria-label="SMTP host" value={host} onChange={(e) => setHost(e.target.value)} /></section>;
    },
  };
});

import { AdminClient } from '../AdminClient';

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { common: en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
});
beforeEach(() => {
  isMobile = false;
  health = { directoryWritable: true, backupEnabled: true, lastSuccessAt: '2026-11-08T03:00:00.000Z' };
  systemConfig = { registrationOpen: false };
});

const nav = () => screen.getByRole('navigation', { name: 'Administration sections' });

describe('AdminClient (#698, #756)', () => {
  it('reaches every section from the section list, one at a time', () => {
    render(<AdminClient />);
    expect(screen.getByRole('grid', { name: 'Member Management' })).toBeInTheDocument();
    for (const [label, marker] of [
      ['Guest links', 'shares-section'], ['Peak Maturity References', 'maturity-section'],
      ['System Configuration', 'config-section:notifications'], ['Audit Log', 'audit-section'],
    ]) {
      fireEvent.click(within(nav()).getByRole('button', { name: label }));
      expect(screen.getByText(marker)).toBeInTheDocument();
      expect(screen.queryByRole('grid', { name: 'Member Management' })).toBeNull();
      expect(within(nav()).getByRole('button', { name: label })).toHaveAttribute('aria-current', 'true');
    }
    // #757: the purge moved to System configuration → Data.
    expect(within(nav()).getAllByRole('button')).toHaveLength(5);
    expect(within(nav()).queryByRole('button', { name: 'Maintenance' })).toBeNull();
  });

  it('says in the Members block whether sign-up is open, and leads to the Access tab', () => {
    render(<AdminClient />);
    expect(screen.getByText('Sign-up is closed: nobody can create an account on their own.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByText('config-section:access')).toBeInTheDocument();
  });

  it('says when sign-up is open', () => {
    systemConfig = { registrationOpen: true };
    render(<AdminClient />);
    expect(screen.getByText('Sign-up is open: anyone who reaches this instance can create an account.')).toBeInTheDocument();
  });

  it('keeps a half-edited settings form when the admin switches section and back', () => {
    render(<AdminClient />);
    fireEvent.click(within(nav()).getByRole('button', { name: 'System Configuration' }));
    fireEvent.change(screen.getByLabelText('SMTP host'), { target: { value: 'smtp.example.com' } });
    fireEvent.click(within(nav()).getByRole('button', { name: 'Audit Log' }));
    expect(screen.getByLabelText('SMTP host')).not.toBeVisible();
    fireEvent.click(within(nav()).getByRole('button', { name: 'System Configuration' }));
    expect(screen.getByLabelText('SMTP host')).toHaveValue('smtp.example.com');
  });

  it('reads a member\'s status as text, apart from the action that changes it, without fading the row', () => {
    render(<AdminClient />);
    const row = screen.getByRole('row', { name: /bob/ });
    expect(within(row).getByText('Disabled')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Activate' })).toBeInTheDocument();
    expect(row.className).not.toMatch(/opacity/);
  });

  it('lists members as cards on a phone', () => {
    isMobile = true;
    render(<AdminClient />);
    expect(screen.queryByRole('grid')).toBeNull();
    const bob = screen.getAllByRole('listitem')[1];
    expect(bob).toHaveTextContent('bob@example.com');
    expect(bob).toHaveTextContent('Disabled');
    expect(within(bob).getByRole('button', { name: /Activate/ })).toBeInTheDocument();
  });

  // #671: the banner shown on every other page links here, to the Data tab.
  it('opens System configuration → Data when reached from the backup alert link', () => {
    window.history.replaceState(null, '', '/admin?tab=data');
    try {
      render(<AdminClient />);
      expect(screen.getByText('config-section:data')).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('says on the admin page that the last backup failed (#671)', () => {
    health = { directoryWritable: true, backupEnabled: true, lastSuccessAt: '2026-11-08T03:00:00.000Z', lastRunFailed: true, overdue: false };
    render(<AdminClient />);
    expect(screen.getByRole('alert')).toHaveTextContent('The last backup failed');
  });

  it('warns at the top when automatic backups are off, and opens the Data tab', () => {
    health = { directoryWritable: true, backupEnabled: false, lastSuccessAt: '2026-11-08T03:00:00.000Z' };
    render(<AdminClient />);
    expect(screen.getByRole('alert')).toHaveTextContent('Automatic backups are switched off');
    expect(within(nav()).getByRole('img', { name: 'Needs attention: no up-to-date backup' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open backups' }));
    expect(screen.getByText('config-section:data')).toBeInTheDocument();
  });

  it('warns when no backup ever succeeded', () => {
    health = { directoryWritable: true, backupEnabled: true, lastSuccessAt: null };
    render(<AdminClient />);
    expect(screen.getByRole('alert')).toHaveTextContent('No backup has ever succeeded');
  });

  it('says nothing when backups are fine', () => {
    render(<AdminClient />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
