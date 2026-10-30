import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  patchCachedItem: vi.fn(async () => {}),
  putCachedItem: vi.fn(async () => {}),
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
  if (typeof found === 'string') return found.replace('{{count}}', String(options?.count ?? ''));
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
});
