import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Drawer, DrawerContent, HeroUIProvider } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { QueuedMutation } from '@/lib/offline/db';
import type { InventoryItem } from '@/lib/inventory/types';
import type { Product } from '@/lib/products/types';
import fr from '@/public/locales/fr/common.json';
import tailwind from '@/tailwind.config';

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

/**
 * The tasting form and the conflict dialog, as a page of the app mounts them.
 * `drawer`: the wine's drawer the form is usually opened from
 * (FamilyDrawer → « Noter une dégustation »), which stays open behind it.
 */
function Harness({ open, drawer = false, appLayer = false }: { open: boolean; drawer?: boolean; appLayer?: boolean }) {
  return (
    <HeroUIProvider disableAnimation>
      <QueryClientProvider client={queryClient}>
        {/* A full-screen layer of the app's own, written by hand rather than
            opened as a HeroUI window: the lock screen, the onboarding wizard,
            the fullscreen map. It says `aria-modal` too, and never leaves the
            page while it is up. */}
        {appLayer && <div role="dialog" aria-modal="true" aria-label="lock">locked</div>}
        <Drawer isOpen={drawer}>
          <DrawerContent>{() => <p>drawer</p>}</DrawerContent>
        </Drawer>
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

/** The two windows as the page holds them, found by what they show. */
const conflictModal = () => conflictDialog()?.closest('[aria-modal="true"]') ?? null;
const formModal = () => Array.from(document.querySelectorAll('[aria-modal="true"]'))
  .find((el) => el !== conflictModal()) ?? null;

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
    const form = formModal();
    const conflict = conflictModal();
    expect(form).not.toBeNull();
    expect(conflict).not.toBeNull();
    const covered = form!.compareDocumentPosition(conflict!) & Node.DOCUMENT_POSITION_FOLLOWING;
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
    await waitFor(() => expect(conflictDialog()).toBeNull());
    expect(notes().value).toBe(typed);
    // Nothing is lost: the change is still queued, waiting to be arbitrated.
    expect(store.get('A')?.status).toBe('conflict');

    // The form closed, the question is asked again.
    view.rerender(<Harness open={false} />);
    await waitFor(() => expect(conflictDialog()).not.toBeNull());
  });

  // B1 of the review of #1059: the question was asked again only once EVERY
  // window was closed, and the form is opened from the wine's drawer
  // (FamilyDrawer), which stays open behind it: the arbitration was then
  // never asked again, with nothing on screen saying it was still owed.
  it('comes back when the form closes, even with the wine\'s drawer still open behind it', async () => {
    store.set('A', drinkConflict());
    // The member drank from the drawer; the replay raises the conflict over it.
    const view = render(<Harness open={false} drawer />);
    await waitFor(() => expect(conflictDialog()).not.toBeNull());

    // « Noter une dégustation » in that same drawer opens the form over it.
    view.rerender(<Harness open drawer />);
    await waitFor(() => expect(notes()).toBeInTheDocument());
    await waitFor(() => expect(conflictDialog()).toBeNull());

    // The form closed; the drawer is still open.
    view.rerender(<Harness open={false} drawer />);
    await waitFor(() => expect(conflictDialog()).not.toBeNull());
  });

  // Same for the app's own full-screen layers (LockScreen,
  // ForcedPasswordChange, OnboardingWizard, the fullscreen map): they say
  // `aria-modal` as well, so waiting for "no window at all" would have left
  // the question owed for as long as one of them was up.
  it('comes back when the form closes, even under one of the app\'s own full-screen layers', async () => {
    store.set('A', drinkConflict());
    const view = render(<Harness open={false} appLayer />);
    await waitFor(() => expect(conflictDialog()).not.toBeNull());

    view.rerender(<Harness open appLayer />);
    await waitFor(() => expect(notes()).toBeInTheDocument());
    await waitFor(() => expect(conflictDialog()).toBeNull());

    view.rerender(<Harness open={false} appLayer />);
    await waitFor(() => expect(conflictDialog()).not.toBeNull());
  });
});

// #1059: HeroUI gives the messages their own layer, above every modal —
// « 1 bouteille bue · Annuler » lay over this dialog's description on a
// phone, and the member decided without reading what had changed. The dialog
// that must be read goes to the app's `blocking` level, whose place in the
// stacking order (above HeroUI's windows and messages, under the lock screen)
// is checked by tailwind.config.test.ts.
describe('the conflict dialog is above the messages (#1059)', () => {
  const BLOCKING = (tailwind.theme?.extend?.zIndex as Record<string, string>).blocking;

  it('its container and its backdrop carry the blocking level, not the modals\' z-50', async () => {
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
      // The documented `blocking` level, never a value of its own: its place
      // above HeroUI's windows and messages is what tailwind.config.test.ts
      // checks, against HeroUI's real styles.
      expect(classes).toContain(`z-[${BLOCKING}]`);
      // The theme's own z-50 must have been merged away, or the two levels
      // would be settled by the order of the stylesheet.
      expect(classes).not.toContain('z-50');
    }
  });
});
