import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next, { type i18n as I18n } from 'i18next';
import en from '../../../public/locales/en/common.json';
import type { AdminGuestShare } from '@shared/shares';

// #486: the admin sees every member's guest links still in force — owner,
// scope, write access, expiry — and can revoke one, after a confirmation.

let i18n: I18n;
let shares: AdminGuestShare[] = [];
const revoke = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (i18n.t as unknown as (k: string, o?: unknown) => string)(k, o),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useAdmin', () => ({
  useAdminShares: () => ({ data: shares, isLoading: false, isError: false }),
  useRevokeAdminShare: () => ({ mutate: revoke, isPending: false }),
}));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
// The modal parts render plainly inside the mocked ResponsiveModal.
vi.mock('@heroui/react', async (importOriginal) => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ...(await importOriginal<typeof import('@heroui/react')>()),
    ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
      <>{typeof children === 'function' ? children(() => {}) : children}</>
    ),
    ModalHeader: Box,
    ModalBody: Box,
    ModalFooter: Box,
  };
});

import { AdminSharesSection } from '../AdminSharesSection';

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { common: en } }, defaultNS: 'common', interpolation: { escapeValue: false } });
});
beforeEach(() => revoke.mockReset());

const share: AdminGuestShare = {
  id: 's1', label: 'For Paul', inviteeName: 'Paul', expiresAt: null, hidePrices: true, hideNotes: false,
  cellarCount: 2, writeCellarCount: 1, collectionCount: 0, createdAt: '2026-10-01T10:00:00.000Z',
  owner: { id: 'u2', username: 'bob', displayName: 'Bob', isActive: true },
};

describe('AdminSharesSection (#486)', () => {
  it('describes each link with its owner, scope, write access and expiry', () => {
    shares = [share];
    render(<AdminSharesSection />);
    const card = screen.getByRole('listitem');
    expect(card).toHaveTextContent('For Paul');
    expect(card).toHaveTextContent('Guest: Paul');
    expect(card).toHaveTextContent('Made by Bob');
    expect(card).toHaveTextContent('2 cellars');
    expect(card).toHaveTextContent('1 cellar with write access');
    expect(card).toHaveTextContent('No expiration');
    expect(card).toHaveTextContent('Prices and values are hidden');
  });

  it('revokes a link only once the admin confirms', () => {
    shares = [share];
    render(<AdminSharesSection />);
    fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Revoke' }));
    expect(revoke).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('made by Bob will stop working at once');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(revoke).toHaveBeenCalledWith('s1', expect.anything());
  });

  it('says when the owner is deactivated, so the admin can revoke a link that would revive', () => {
    shares = [share, { ...share, id: 's2', owner: { ...share.owner, isActive: false } }];
    render(<AdminSharesSection />);
    const [active, deactivated] = screen.getAllByRole('listitem');
    expect(active).not.toHaveTextContent('account is deactivated');
    expect(deactivated).toHaveTextContent("This member's account is deactivated");
  });

  it('says so when there is no link in force', () => {
    shares = [];
    render(<AdminSharesSection />);
    expect(screen.getByText('No guest link in force.')).toBeInTheDocument();
  });
});
