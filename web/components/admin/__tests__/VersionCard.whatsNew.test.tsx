import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// FEAT-115 (#990): Administration → System → Version has a What's New? link,
// next to the instance's version, that reopens the window.

const open = vi.fn();
let whatsNew: { open: () => void; version: string | undefined } | null = null;

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }), initReactI18next: { type: '3rdParty', init: () => {} } }));
vi.mock('@/hooks/useAppVersion', () => ({ useAppVersion: () => ({ data: '2026.12', isPending: false, isError: false }) }));
vi.mock('@/components/whats-new/WhatsNewProvider', () => ({ useWhatsNew: () => whatsNew }));

import { VersionCard } from '../config/system/VersionCard';

beforeEach(() => {
  open.mockReset();
  whatsNew = { open, version: '2026.12' };
});

describe('VersionCard What\'s New? link (#990)', () => {
  it('reopens the window', () => {
    render(<VersionCard />);
    expect(screen.getByText('2026.12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'whatsNew.open' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('has no link outside the signed-in app (no window to open)', () => {
    whatsNew = null;
    render(<VersionCard />);
    expect(screen.queryByRole('button', { name: 'whatsNew.open' })).toBeNull();
  });
});
