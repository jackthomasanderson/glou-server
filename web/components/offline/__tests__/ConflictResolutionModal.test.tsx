import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { QueuedMutation } from '@/lib/offline/db';
import fr from '@/public/locales/fr/common.json';
import { notifyError, notifySuccess } from '@/lib/toast';
import { cancelSyncRetry } from '@/lib/offline/syncEngine';

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
  claimQueuedMutation: vi.fn(async (id: string) => {
    const found = store.get(id);
    if (!found || found.status !== 'pending') return undefined;
    const claimed = { ...found, status: 'syncing' as const };
    store.set(id, claimed);
    return claimed;
  }),
  takeQueuedMutationUnlessSyncing: vi.fn(async (id: string) => {
    const found = store.get(id);
    if (!found || found.status === 'syncing') return undefined;
    store.delete(id);
    return found;
  }),
  rewriteCachedItems: vi.fn(async () => {}),
}));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => true }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn(), notifyUndoable: vi.fn() }));
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
  Button: ({ children, onPress, isDisabled, 'data-primary': primary }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean; 'data-primary'?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled} data-primary={primary === undefined ? undefined : String(primary)}>{children}</button>
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
  vi.clearAllMocks();
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

describe('ConflictResolutionModal — a drink that may already be recorded (review of #823, N1)', () => {
  it('×6 then, ×5 now: says the connection may have dropped, and puts « Garder la version serveur » first', async () => {
    store.set('A', {
      ...conflict('A', 't1', { isOpened: true, fillLevel: 0 }),
      before: { quantity: 6 },
      conflictServerItem: { ...serverItem, isOpened: false, fillLevel: 100, quantity: 5 } as unknown as QueuedMutation['conflictServerItem'],
    });
    page();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('conflict-maybe-recorded')).toHaveTextContent(fr.offline.conflict.maybeRecorded);
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepServer })).toHaveAttribute('data-primary', 'true');
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepLocal })).toHaveAttribute('data-primary', 'false');
  });

  it('« J\'en fume un » in an opened box (×1, 10 → 9): the hint too, « Garder la version serveur » first', async () => {
    store.set('A', {
      ...conflict('A', 't1', { smokeOne: true }),
      before: { quantity: 1, isOpened: true, fillLevel: null, cigarsLeft: 10 },
      conflictServerItem: { ...serverItem, quantity: 1, isOpened: true, fillLevel: null, cigarsLeft: 9, cigarsPerBox: 25 } as unknown as QueuedMutation['conflictServerItem'],
    });
    page();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('conflict-maybe-recorded')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepServer })).toHaveAttribute('data-primary', 'true');
  });

  it('×6 then, ×4 now (changed elsewhere): no such hint, « Garder ma version » stays first', async () => {
    store.set('A', {
      ...conflict('A', 't1', { isOpened: true, fillLevel: 0 }),
      before: { quantity: 6 },
      conflictServerItem: { ...serverItem, isOpened: false, fillLevel: 100, quantity: 4 } as unknown as QueuedMutation['conflictServerItem'],
    });
    page();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByTestId('conflict-maybe-recorded')).toBeNull();
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepLocal })).toHaveAttribute('data-primary', 'true');
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

// #1038: the dialog showed "×1 maintenant" for a line already finished on
// the server (the value kept since the conflict came back), and « Garder ma
// version » closed it without a word.
describe('ConflictResolutionModal — the server\'s line as it is now (#1038)', () => {
  const drinkConflict = (stored: Record<string, unknown>) => ({
    ...conflict('A', 't1', { isOpened: true, fillLevel: 0 }),
    before: { quantity: 6 },
    conflictServerItem: { ...serverItem, isOpened: false, fillLevel: 100, ...stored } as unknown as QueuedMutation['conflictServerItem'],
  });
  /** The API: GET /api/inventory/A answers `unit` (404 when null); anything else is the connectivity probe. */
  function serverHas(unit: Record<string, unknown> | null) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/inventory/A')) {
        return unit ? { ok: true, status: 200, json: async () => ({ data: unit }) } : { ok: false, status: 404, json: async () => ({ error: 'NOT_FOUND' }) };
      }
      return { ok: true, status: 200, json: async () => ({ online: true }) };
    }));
  }

  it('reads the line again from the server: ×4 now, not the ×3 kept with the conflict', async () => {
    store.set('A', drinkConflict({ quantity: 3 }));
    serverHas({ ...serverItem, isOpened: false, fillLevel: 100, quantity: 4 });
    page();
    const action = await screen.findByTestId('conflict-action');
    await waitFor(() => expect(action).toHaveTextContent('×6 quand vous avez agi, ×4 maintenant'));
  });

  it('a line finished on the server is said to be no longer in stock, not "×1 maintenant"', async () => {
    store.set('A', { ...drinkConflict({ quantity: 1 }), before: { quantity: 1 } });
    serverHas({ ...serverItem, quantity: 1, isOpened: true, fillLevel: 0 });
    page();
    const action = await screen.findByTestId('conflict-action');
    await waitFor(() => expect(action).toHaveTextContent('×1 quand vous avez agi, plus en stock maintenant'));
    expect(action).not.toHaveTextContent('×1 maintenant');
  });

  it('a line that no longer exists on the server is said so', async () => {
    store.set('A', drinkConflict({ quantity: 3 }));
    serverHas(null);
    page();
    expect(await screen.findByTestId('conflict-line-gone')).toHaveTextContent(fr.offline.conflict.lineGone);
    expect(screen.getByTestId('conflict-action')).not.toHaveTextContent('quand vous avez agi');
  });

  it('without an answer from the server, keeps the line as it came back with the conflict', async () => {
    store.set('A', drinkConflict({ quantity: 3 }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/inventory/A')) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => ({ online: true }) };
    }));
    page();
    expect(await screen.findByTestId('conflict-action')).toHaveTextContent('×6 quand vous avez agi, ×3 maintenant');
  });
});

/** « Garder ma version », once the line has been read again (it waits for it). */
async function pressKeepLocal(dialog: HTMLElement) {
  const keep = within(dialog).getByRole('button', { name: fr.offline.conflict.keepLocal });
  await waitFor(() => expect(keep).toBeEnabled());
  fireEvent.click(keep);
}

describe('ConflictResolutionModal — « Garder ma version » says what was kept (#1038)', () => {
  it('sent: says the action kept and that it is recorded', async () => {
    store.set('A', {
      ...conflict('A', 't1', { isOpened: true, fillLevel: 0 }),
      before: { quantity: 6 },
      conflictServerItem: { ...serverItem, isOpened: false, fillLevel: 100, quantity: 4 } as unknown as QueuedMutation['conflictServerItem'],
    });
    page();
    const dialog = await screen.findByRole('dialog');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'PATCH'
      ? { ok: true, status: 200, json: async () => ({ data: { id: 'A', updatedAt: 'v9' }, changed: [], removedIds: [] }) }
      : { ok: true, status: 200, json: async () => ({ online: true }) })));

    await pressKeepLocal(dialog);

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('offline.conflict.keptLocal.sent', { what: "J'en bois une — Château Test" }));
    expect(notifySuccess).not.toHaveBeenCalledWith('offline.synced', expect.anything());
  });

  it('still offline: says it is kept and will be sent when the connection is back', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    page();
    const dialog = await screen.findByRole('dialog');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    await pressKeepLocal(dialog);

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('offline.conflict.keptLocal.pending', { what: 'Château Test' }));
    vi.restoreAllMocks();
  });

  it('online but the server asks to wait (503): says it will be sent in a moment, not "when the connection is back"', async () => {
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    page();
    const dialog = await screen.findByRole('dialog');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'PATCH'
      ? { ok: false, status: 503, json: async () => ({ error: 'SERVICE_UNAVAILABLE' }) }
      : { ok: true, status: 200, json: async () => ({ online: true }) })));

    await pressKeepLocal(dialog);

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('offline.conflict.keptLocal.soon', { what: 'Château Test' }));
    cancelSyncRetry();
  });

  it('the line changed once more: says so, and the dialog shows it again', async () => {
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    page();
    const dialog = await screen.findByRole('dialog');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'PATCH'
      ? { ok: false, status: 409, json: async () => ({ error: 'CONFLICT', data: { ...serverItem, id: 'A', updatedAt: '2026-04-03T10:00:00.000Z' } }) }
      : { ok: true, status: 200, json: async () => ({ online: true }) })));

    await pressKeepLocal(dialog);

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('offline.conflict.keptLocal.changedAgain', { what: 'Château Test' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('refused by the server: says it could not be recorded', async () => {
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    page();
    const dialog = await screen.findByRole('dialog');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'PATCH'
      ? { ok: false, status: 404, json: async () => ({ error: 'ITEM_NOT_FOUND' }) }
      : { ok: true, status: 200, json: async () => ({ online: true }) })));

    await pressKeepLocal(dialog);

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('offline.conflict.keptLocal.failed', { what: 'Château Test' }));
  });
});

// Review of #1054.
describe('ConflictResolutionModal — what is shown is what is applied (review of #1054)', () => {
  function serverHas(unit: Record<string, unknown> | null) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/inventory/A')) {
        return unit ? { ok: true, status: 200, json: async () => ({ data: unit }) } : { ok: false, status: 404, json: async () => ({ error: 'ITEM_NOT_FOUND' }) };
      }
      return { ok: true, status: 200, json: async () => ({ online: true }) };
    }));
  }

  it('B1: a line changed again since the conflict: the version read now becomes the one « Garder ma version » applies against', async () => {
    store.set('A', { ...conflict('A', 't1', { isOpened: true, fillLevel: 0 }), before: { quantity: 6 } });
    serverHas({ ...serverItem, quantity: 3, isOpened: false, fillLevel: 100, updatedAt: '2026-04-05T10:00:00.000Z' });
    page();

    await waitFor(() => expect(store.get('A')?.conflictServerItem).toMatchObject({ quantity: 3, updatedAt: '2026-04-05T10:00:00.000Z' }));
  });

  it('the actions wait for the line to be read again (no tap on a value about to change)', async () => {
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    page();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepLocal })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepServer })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.decideLater })).toBeEnabled();
  });

  it('a line that no longer exists offers no « Garder ma version »: keeping the server\'s version comes first', async () => {
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    serverHas(null);
    page();
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByTestId('conflict-line-gone');
    expect(within(dialog).queryByRole('button', { name: fr.offline.conflict.keepLocal })).toBeNull();
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepServer })).toHaveAttribute('data-primary', 'true');
  });
});

// Second review of #1054 (C1): a query is paused while the browser is
// offline, so tying the choices to "the line is being read" left the member
// stuck in a dialog that cannot be dismissed — offline is the whole point
// of this screen.
describe('ConflictResolutionModal — offline, the conflict can still be resolved (review of #1054)', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('both choices stay usable with no answer from the server', async () => {
    onlineManager.setOnline(false);
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    page();

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepLocal })).toBeEnabled());
    expect(within(dialog).getByRole('button', { name: fr.offline.conflict.keepServer })).toBeEnabled();
  });

  it('« Garder ma version » offline keeps it and says it waits for the connection', async () => {
    onlineManager.setOnline(false);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    page();
    const dialog = await screen.findByRole('dialog');

    await pressKeepLocal(dialog);

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('offline.conflict.keptLocal.pending', { what: 'Château Test' }));
    vi.restoreAllMocks();
  });

  it('« Garder la version serveur » offline drops the change: it needs no network', async () => {
    onlineManager.setOnline(false);
    store.set('A', conflict('A', 't1', { region: 'Loire' }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    page();
    const dialog = await screen.findByRole('dialog');
    const keepServer = within(dialog).getByRole('button', { name: fr.offline.conflict.keepServer });
    await waitFor(() => expect(keepServer).toBeEnabled());

    fireEvent.click(keepServer);

    await waitFor(() => expect(store.size).toBe(0));
  });
});
