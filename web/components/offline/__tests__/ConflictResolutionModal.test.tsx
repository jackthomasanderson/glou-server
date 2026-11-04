import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { QueuedMutation } from '@/lib/offline/db';
import fr from '@/public/locales/fr/common.json';

// #585: the conflict dialog listed every key of the queued change (ids,
// dates, "[object Object]", "Cellar: — / —") in English fallback labels, and
// "Decide later" was forgotten at the next page.

const { store } = vi.hoisted(() => ({ store: new Map<string, QueuedMutation>() }));

// The real sync engine and useOfflineSync run on an in-memory queue.
vi.mock('@/lib/offline/db', () => ({
  getAllQueuedMutations: vi.fn(async () =>
    [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  ),
  putQueuedMutation: vi.fn(async (m: QueuedMutation) => { store.set(m.id, m); }),
  deleteQueuedMutation: vi.fn(async (id: string) => { store.delete(id); }),
  getQueuedMutation: vi.fn(async (id: string) => store.get(id)),
  rewriteCachedItems: vi.fn(async () => {}),
}));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => true }));
vi.mock('@/hooks/useCellars', () => ({
  useCellars: () => ({ data: [{ id: 'c-up', name: 'Cave du haut' }, { id: 'c-down', name: 'Cave du bas' }] }),
}));

// French labels read from the real locale file: a missing one would show the
// English fallback ("Fill Level"), which the assertions below would catch.
function translate(key: string, options?: Record<string, unknown>): string {
  const found = key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    fr,
  );
  if (typeof found === 'string') return found.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ''));
  return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
}
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate, i18n: { language: 'fr' } }),
}));

vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>{children}</button>
  ),
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  ModalContent: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { ConflictResolutionModal } from '../ConflictResolutionModal';
import { PendingChangesList } from '../PendingChangesList';

const serverItem = {
  id: 'A', userId: 'u1', name: 'Château Test', region: 'Bordeaux', cellarId: 'c-up',
  isOpened: true, fillLevel: 50, quantity: 6, tags: ['rouge'],
  createdAt: '2026-03-12T10:00:00.000Z', updatedAt: '2026-04-02T10:00:00.000Z',
  collections: [{ id: 'k1', name: 'Garde', color: 'red' }], fieldSources: { region: 'manual' },
};

function conflict(id: string, createdAt: string, patch: Record<string, unknown>, name = 'Château Test'): QueuedMutation {
  return {
    id, itemId: id, createdAt, status: 'conflict', expectedUpdatedAt: '2026-04-01T10:00:00.000Z',
    patch, conflictServerItem: { ...serverItem, id, name } as unknown as QueuedMutation['conflictServerItem'],
  };
}

function page() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConflictResolutionModal />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  store.clear();
  window.sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ online: true }) })));
});

describe('ConflictResolutionModal (#585)', () => {
  it('lists only the fields that differ, with translated labels and the cellar name', async () => {
    // A whole record sent by the edit form: the region, the cellar and the
    // number of bottles changed.
    store.set('A', conflict('A', 't1', {
      ...serverItem,
      region: 'Loire',
      cellarId: 'c-down',
      quantity: 5,
      updatedAt: '2026-04-01T10:00:00.000Z',
      collections: [],
    }));
    page();

    const dialog = await screen.findByRole('dialog');
    const rows = within(dialog).getAllByText(/^(Région|Cave|Quantité)$/);
    expect(rows.map((r) => r.textContent)).toEqual(['Région', 'Cave', 'Quantité']);
    expect(within(dialog).getByText('Cave du bas')).toBeInTheDocument();
    expect(within(dialog).getByText('Cave du haut')).toBeInTheDocument();
    for (const technical of ['Id', 'User Id', 'Created At', 'Updated At', 'Field Sources', 'Collections', '—']) {
      expect(within(dialog).queryByText(technical)).toBeNull();
    }
    expect(within(dialog).queryByText(/object Object/)).toBeNull();
    // Unchanged fields are left out.
    expect(within(dialog).queryByText('Niveau restant')).toBeNull();
  });

  it('"Decide later" survives a page change', async () => {
    store.set('A', conflict('A', 't1', { fillLevel: 0 }, 'Premier vin'));
    store.set('B', conflict('B', 't2', { fillLevel: 10 }, 'Second vin'));
    const first = page();

    expect(await screen.findByText('Premier vin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: fr.offline.conflict.decideLater }));
    expect(await screen.findByText('Second vin')).toBeInTheDocument();

    // Next page: the layout, and the dialog with it, is mounted again.
    first.unmount();
    page();

    expect(await screen.findByText('Second vin')).toBeInTheDocument();
    expect(screen.queryByText('Premier vin')).toBeNull();
  });

  it('"Resolve" in the pending changes panel reopens a postponed conflict', async () => {
    store.set('A', conflict('A', 't1', { fillLevel: 0 }, 'Premier vin'));
    const onResolveConflict = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ConflictResolutionModal />
        <PendingChangesList onResolveConflict={onResolveConflict} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Premier vin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: fr.offline.conflict.decideLater }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: fr.connectivity.panel.resolve }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Premier vin');
    expect(onResolveConflict).toHaveBeenCalled();
  });

  it('FEAT-108: an action on a line is said as such, with the line\'s number then and now', async () => {
    store.set('A', {
      ...conflict('A', 't1', { isOpened: true, fillLevel: 100, openedAt: '2026-11-04T10:00:00.000Z' }),
      before: { quantity: 6 },
      conflictServerItem: { ...serverItem, isOpened: false, fillLevel: 100, quantity: 3 } as unknown as QueuedMutation['conflictServerItem'],
    });
    page();

    const dialog = await screen.findByRole('dialog');
    const action = within(dialog).getByTestId('conflict-action');
    expect(action).toHaveTextContent("Votre action : J'en ouvre une");
    expect(action).toHaveTextContent('×6 quand vous avez agi, ×3 maintenant');
    // Not as fields ("Ouvert : oui / non").
    expect(within(dialog).queryByText(fr.offline.conflict.field)).toBeNull();
  });
});

describe('PendingChangesList (FEAT-108)', () => {
  it('says what each change does, and a refusal in words', async () => {
    store.set('c1', {
      // Failed (else the replay run when the list mounts would send it).
      id: 'c1', itemId: 'A', createdAt: 't1', status: 'failed', expectedUpdatedAt: 'v1', kind: 'correct',
      patch: { quantity: 5, reason: 'written_off' }, before: { quantity: 6 },
    });
    store.set('p1', {
      id: 'p1', itemId: 'B', createdAt: 't2', status: 'failed', expectedUpdatedAt: 'v1',
      patch: { isOpened: false, fillLevel: 100 }, errorCode: 'TASTINGS_ON_ITEM', errorReason: 'TASTINGS_ON_ITEM',
    });
    const queryClient = new QueryClient();
    render(<QueryClientProvider client={queryClient}><PendingChangesList /></QueryClientProvider>);

    expect(await screen.findByText('Nombre corrigé : 6 → 5')).toBeInTheDocument();
    expect(document.body).toHaveTextContent(fr.toast.tastingsOnBottle);
    expect(screen.queryByText(/: TASTINGS_ON_ITEM$/)).toBeNull();
  });
});
