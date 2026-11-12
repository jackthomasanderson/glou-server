import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import i18next, { type i18n as I18n } from 'i18next';
import en from '../../../public/locales/en/common.json';
import fr from '../../../public/locales/fr/common.json';
import { AUDIT_ACTIONS, AUDIT_STATUSES } from '@shared/audit';
import type { AuditLogFilters, AuditLogResponse } from '@/hooks/useAdmin';

// #698: the audit log speaks the admin's language — action types and statuses
// are translated, filterable by action type — and reads as cards on a phone.

let i18n: I18n;
let isMobile = false;
const calls: AuditLogFilters[] = [];
const response: AuditLogResponse = {
  items: [
    { id: 1, userId: 'u1', user: { username: 'alice', displayName: null }, bottleId: null, action: 'LOGIN_2FA', status: 'validation_error', ip: '10.0.0.1', details: null, createdAt: '2026-11-08T10:00:00.000Z' },
    { id: 2, userId: 'u1', user: { username: 'alice', displayName: null }, bottleId: null, action: 'OLD_CODE', status: 'success', ip: '10.0.0.1', details: null, createdAt: '2026-11-08T09:00:00.000Z' },
  ],
  meta: { page: 1, limit: 50, total: 2, pages: 1 },
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: unknown) => string)(k, o),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => isMobile }));
vi.mock('@/hooks/useAdmin', () => ({
  useAdminAuditLogs: (_page: number, _limit: number, filters: AuditLogFilters) => {
    calls.push(filters);
    return { data: response, isLoading: false };
  },
}));

import { AuditLogSection } from '../AuditLogSection';

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { common: en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
});
beforeEach(() => { isMobile = false; calls.length = 0; });

describe('AuditLogSection (#698)', () => {
  it('every action type and status has a label in both languages', () => {
    for (const lang of [en, fr]) {
      const log = lang.admin.auditLog as unknown as { actions: Record<string, string>; statuses: Record<string, string> };
      for (const code of AUDIT_ACTIONS) expect(log.actions[code], code).toBeTruthy();
      for (const status of AUDIT_STATUSES) expect(log.statuses[status], status).toBeTruthy();
    }
  });

  it('shows translated action types and statuses, an unknown old code as it is', () => {
    render(<AuditLogSection />);
    const table = screen.getByRole('grid');
    expect(within(table).getByText('Sign-in with two-factor')).toBeInTheDocument();
    expect(within(table).getByText('Rejected, invalid input')).toBeInTheDocument();
    expect(within(table).getByText('OLD_CODE')).toBeInTheDocument();
    expect(within(table).queryByText('LOGIN_2FA')).toBeNull();
  });

  it('offers an action-type filter next to the member search', () => {
    render(<AuditLogSection />);
    expect(screen.getAllByText('Action types').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('lists entries as cards on a phone, without a table to scroll sideways', () => {
    isMobile = true;
    render(<AuditLogSection />);
    expect(screen.queryByRole('grid')).toBeNull();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Sign-in with two-factor');
    expect(items[0]).toHaveTextContent('alice');
    expect(items[0]).toHaveTextContent('10.0.0.1');
  });

  // #695: a member deleted for good: their entries stay, under the name kept on them.
  it('names a member deleted since by the name kept on the entry', () => {
    response.items = [
      { id: 3, userId: null, user: null, actorName: 'marie', bottleId: null, action: 'LOGIN', status: 'success', ip: '10.0.0.2', details: null, createdAt: '2026-11-08T08:00:00.000Z' },
    ];
    render(<AuditLogSection />);
    expect(within(screen.getByRole('grid')).getByText('marie')).toBeInTheDocument();
  });
});
