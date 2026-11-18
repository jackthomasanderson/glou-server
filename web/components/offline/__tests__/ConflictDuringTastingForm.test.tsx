import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HeroUIProvider } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { QueuedMutation } from '@/lib/offline/db';
import type { InventoryItem } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import fr from '@/public/locales/fr/common.json';

// #1059: a sync conflict raised while the tasting form is open used to mount
// under it — HeroUI gives every modal the same full-screen container at the
// same z-index, so the one opened last swallows every click meant for the
// other, and Escape (the only way out) closed the form and lost the note
// being written. Both windows render here for real (real HeroUI modals, real
// `aria-modal`), which is what the conflict dialog now looks at.

const { store } = vi.hoisted(() => ({ store: new Map<string, QueuedMutation>() }));

vi.mock('@/lib/offline/db', () => ({
  getAllQueuedMutations: vi.fn(async () =>
    [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  ),
  putQueuedMutation: vi.fn(async (m: QueuedMutation) => { store.set(m.id, m); }),
  deleteQueuedMutation: vi.fn(async (id: string) => { store.delete(id); }),
  getQueuedMutation: vi.fn(async (id: string) => store.get(id)),
  claimQueuedMutation: vi.fn(async () => undefined),
  takeQueuedMutationUnlessSyncing: vi.fn(async () => undefined),
  rewriteCachedItems: vi.fn(async () => {}),
}));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => true }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn(), notifyUndoable: vi.fn() }));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'c1', name: 'Garage' }] }) }));

// The tasting form's own round-trips, as its own tests mock them.
const createMutateAsync = vi.fn();
vi.mock('@/hooks/useTastings', () => ({
  useCreateTasting: () => ({ mutateAsync: createMutateAsync, isPending: false, error: null }),
  useUpdateTasting: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: [] }),
  useUpdateInventoryItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInventoryItemLookup: () => vi.fn(async () => undefined),
  REATTACH_REFUSALS: {},
}));
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ data: products }) }));
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => false }));
vi.mock('@/components/tastings/ServiceRecommendations', () => ({ ServiceRecommendations: () => null }));

/** French labels read from the real locale file (as in ConflictResolutionModal.test.tsx). */
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

import { TastingForm } from '@/components/tastings/TastingForm';
import { ConflictResolutionModal } from '../ConflictResolutionModal';
import { undeferConflict } from '@/lib/offline/syncEngine';

const unit = {
  id: 'wine-1', userId: 'u1', name: 'Château Test', producer: 'Producteur', category: 'wine',
  isOpened: false, fillLevel: null, quantity: 6, cellarId: 'c1', tags: [],
  createdAt: '2026-03-12T10:00:00.000Z', updatedAt: '2026-04-02T10:00:00.000Z',
} as unknown as InventoryItem;

const products = [{
  id: 'p-1', name: 'Château Test', producer: 'Producteur', category: 'wine', vintage: null, format: null,
  items: [{ ...unit, productId: 'p-1', deletedAt: null, writtenOffAt: null, cigarsLeft: null, cigarsPerBox: null, purchasedAt: null }],
}] as unknown as Product[];

/** The drink made just before, come back from the server in conflict (#1036 flow). */
function drinkConflict(): QueuedMutation {
  return {
    id: 'A', itemId: 'wine-1', createdAt: 't1', status: 'conflict',
    expectedUpdatedAt: '2026-04-01T10:00:00.000Z',
    patch: { isOpened: true, fillLevel: 0 },
    before: { quantity: 6 },
    conflictServerItem: { ...unit, quantity: 5 } as unknown as QueuedMutation['conflictServerItem'],
  };
}

let queryClient: QueryClient;

/** The tasting form and the conflict dialog, as a page of the app mounts them. */
function Harness({ open }: { open: boolean }) {
  return (
    <HeroUIProvider disableAnimation>
      <QueryClientProvider client={queryClient}>
        <TastingForm open={open} onClose={() => {}} initialItemId="wine-1" />
        <ConflictResolutionModal />
      </QueryClientProvider>
    </HeroUIProvider>
  );
}

const conflictDialog = () => screen.queryByText(fr.offline.conflict.title);
const notes = () => screen.getByLabelText(fr.tastings.fields.notes) as HTMLTextAreaElement;

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  // ResponsiveModal reads window.matchMedia (useIsMobile), absent from jsdom.
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: null }) })));
});

/** The tasting form's own dialog: the open modal that is not the conflict one. */
const formDialog = () => Array.from(document.querySelectorAll('[aria-modal="true"]'))
  .find((el) => !el.hasAttribute('data-conflict-dialog'))!;
const conflictNode = () => document.querySelector('[data-conflict-dialog]');

describe('a conflict and the tasting form, open together (#1059)', () => {
  it('a conflict raised while the form is open is the usable one: last in the page, over the form', async () => {
    render(<Harness open />);
    await waitFor(() => expect(notes()).toBeInTheDocument());

    // The queued drink comes back in conflict right now.
    store.set('A', drinkConflict());
    await act(async () => { undeferConflict('A'); });

    await waitFor(() => expect(conflictDialog()).not.toBeNull());
    // Last opened means painted over the form and holding the focus: its
    // buttons receive the clicks, as they did before this fix.
    const covered = formDialog().compareDocumentPosition(conflictNode()!) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(covered).toBeTruthy();
  });

  it('the form opened over it (the drink\'s « Noter une dégustation ») makes it give way, and nothing typed is lost', async () => {
    // The conflict is already being arbitrated, no window open.
    store.set('A', drinkConflict());
    const view = render(<Harness open={false} />);
    await waitFor(() => expect(conflictDialog()).not.toBeNull());

    // The member opens the tasting form from the drink's message.
    view.rerender(<Harness open />);
    await waitFor(() => expect(notes()).toBeInTheDocument());
    const typed = 'Fruits noirs, longue finale';
    fireEvent.change(notes(), { target: { value: typed } });
    await waitFor(() => expect(notes().value).toBe(typed));

    // The dialog is not left under the form, where its buttons received
    // nothing and Escape closed the form.
    await waitFor(() => expect(conflictNode()).toBeNull());
    expect(notes().value).toBe(typed);
    // Nothing is lost: the change is still queued, waiting to be arbitrated.
    expect(store.get('A')?.status).toBe('conflict');

    // The form closed, the question is asked again.
    view.rerender(<Harness open={false} />);
    await waitFor(() => expect(conflictDialog()).not.toBeNull());
  });
});

// #1059: HeroUI gives the messages their own layer (`z-[100]`), above every
// modal (`z-50`) — « 1 bouteille bue · Annuler » lay over this dialog's
// description on a phone, and the member decided without reading what had
// changed. The dialog that must be read goes above that layer.
describe('the conflict dialog is above the messages (#1059)', () => {
  const MESSAGES_LAYER = 100;

  it('its container and its backdrop are above the messages\' layer, not at the modals\' z-50', async () => {
    store.set('A', drinkConflict());
    render(<Harness open={false} />);
    await waitFor(() => expect(conflictDialog()).not.toBeNull());

    const dialog = screen.getByText(fr.offline.conflict.title).closest('[aria-modal="true"]');
    const wrapper = dialog?.closest('[data-slot="wrapper"]');
    // The two layers HeroUI puts in the page for a modal: its backdrop and
    // the container holding the dialog.
    const layers = Array.from(wrapper?.parentElement?.children ?? []);
    expect(layers).toHaveLength(2);
    for (const layer of layers) {
      const classes = (layer?.className ?? '').split(/\s+/);
      const z = classes.map((c) => /^z-\[(\d+)\]$/.exec(c)?.[1]).find(Boolean);
      expect(Number(z)).toBeGreaterThan(MESSAGES_LAYER);
      // The theme's own z-50 must have been merged away, or it would win on
      // the source order of the stylesheet.
      expect(classes).not.toContain('z-50');
    }
  });
});
