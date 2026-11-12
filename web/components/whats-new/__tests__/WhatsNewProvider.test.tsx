import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ReleaseNotesView } from '@shared/release-notes';

// FEAT-115 (#990): when the What's New? window opens. By itself, for an
// administrator with unseen notes, once nothing else covers the app (lock,
// forced password change, setup wizard) and no other dialog is open; closing
// it marks the notes seen on the server. Never for a member, never without the
// server. The links reopen it at any time, without changing what is seen.

const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api', () => ({ client: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }));

let me: { id: string; isAdmin: boolean } | undefined;
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: me }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));

import { WhatsNewProvider, useWhatsNew } from '../WhatsNewProvider';

const unseen: ReleaseNotesView = {
  currentVersion: '2026.12',
  releases: [{ version: '2026.12', notes: [{ id: 'n1', section: 'new', text: { en: 'A new thing', fr: 'Une nouveauté' }, seen: false }] }],
};
const allSeen: ReleaseNotesView = {
  currentVersion: '2026.12',
  releases: [{ version: '2026.12', notes: [{ id: 'n1', section: 'new', text: { en: 'A new thing', fr: 'Une nouveauté' }, seen: true }] }],
};

function ReopenLink() {
  const whatsNew = useWhatsNew();
  return whatsNew ? <button type="button" onClick={whatsNew.open}>reopen</button> : null;
}

function renderWith(children: ReactNode = <ReopenLink />, blocked = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (b: boolean, c: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <WhatsNewProvider blocked={b}>{c}</WhatsNewProvider>
    </QueryClientProvider>
  );
  const utils = render(tree(blocked, children));
  return { ...utils, rerenderWith: (b: boolean, c: ReactNode = children) => utils.rerender(tree(b, c)) };
}

const dialog = () => screen.queryByRole('dialog');
/** The window opens through a portal and an animation: give it time before saying it did not open. */
const staysClosed = () => expect(screen.findByText('A new thing', {}, { timeout: 300 })).rejects.toThrow();

beforeEach(() => {
  vi.clearAllMocks();
  me = { id: 'a1', isAdmin: true };
  get.mockResolvedValue({ data: unseen });
  post.mockResolvedValue({ data: undefined });
});

describe('WhatsNewProvider (#990)', () => {
  it('opens by itself for an administrator with unseen notes', async () => {
    renderWith();
    expect(await screen.findByRole('dialog')).toHaveTextContent('A new thing');
    expect(get).toHaveBeenCalledWith('/admin/release-notes', expect.anything());
  });

  it('never asks for the notes, nor shows a link, for a member', async () => {
    me = { id: 'm1', isAdmin: false };
    renderWith();
    await act(async () => {});
    expect(get).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
    expect(screen.queryByText('reopen')).toBeNull();
  });

  it('stays closed when every note was seen already (new install, update without notes)', async () => {
    get.mockResolvedValue({ data: allSeen });
    renderWith();
    await waitFor(() => expect(get).toHaveBeenCalled());
    await staysClosed();
  });

  it('stays closed without the server, and marks nothing seen', async () => {
    get.mockRejectedValue(new Error('NETWORK_ERROR'));
    renderWith();
    await waitFor(() => expect(get).toHaveBeenCalled());
    await staysClosed();
    expect(dialog()).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('waits until the lock, the forced password change or the setup wizard is gone', async () => {
    const { rerenderWith } = renderWith(<ReopenLink />, true);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await staysClosed();
    rerenderWith(false);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('never opens on top of another dialog, and opens once it is closed', async () => {
    const other = <div role="dialog" aria-label="conflict">conflict</div>;
    const { rerenderWith } = renderWith(<><ReopenLink />{other}</>);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await staysClosed();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    rerenderWith(false, <ReopenLink />);
    expect(await screen.findByText('A new thing')).toBeInTheDocument();
  });

  it('marks the notes seen when closed, and does not come back in this visit', async () => {
    renderWith();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'whatsNew.gotIt' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/release-notes/seen'));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('reopened from a link, shows the notes and changes nothing to what is seen', async () => {
    get.mockResolvedValue({ data: allSeen });
    renderWith();
    await waitFor(() => expect(get).toHaveBeenCalled());
    fireEvent.click(screen.getByText('reopen'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('A new thing');
    fireEvent.click(screen.getByRole('button', { name: 'whatsNew.gotIt' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });
});
