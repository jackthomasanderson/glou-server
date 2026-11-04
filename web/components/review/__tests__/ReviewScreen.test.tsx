import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { openedBottle, product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { ReviewCases } from '@/lib/review/client';

// #471 (FEAT-102 c1-c5, ux-ui.md §10.7): the review screen against the real
// hooks, the API answered by a stubbed fetch.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
const toast = vi.hoisted(() => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { ReviewScreen } from '../ReviewScreen';

/** Two families of "Cuvée X 2020" apart for their region only: 3 + 5 bottles. */
const bordeaux = product({ id: 'p1', region: 'Bordeaux', items: [unit({ quantity: 3, productId: 'p1' })], createdAt: '2026-01-01T00:00:00.000Z' });
const graves = product({ id: 'p2', region: 'Graves', items: [unit({ quantity: 5, productId: 'p2' })], createdAt: '2026-02-01T00:00:00.000Z' });
const mergeCase = (over: Partial<ReviewCases['merges'][number]> = {}): ReviewCases['merges'][number] => ({
  products: [bordeaux, graves],
  disagreements: [{
    field: 'region',
    values: [{ productId: 'p1', value: 'Bordeaux' }, { productId: 'p2', value: 'Graves' }],
    preselectedProductId: 'p2',
  }],
  units: 8,
  ...over,
});
/** An old finished record "×6": a finished bottle and a guessed group of 5. */
const countCase: ReviewCases['counts'][number] = {
  product: product({ id: 'p3', name: 'Cuvée Y', vintage: 2018 }),
  group: unit({ id: 'g', productId: 'p3', quantity: 5, cellarId: 'garage', purchasePrice: 20, needsReview: true, updatedAt: '2026-10-02T00:00:00.000Z' }),
  subRecords: [openedBottle(0, { id: 's', productId: 'p3', parentItemId: 'g' })],
};

/** The API: what GET /review lists, and every request recorded. */
let listed: ReviewCases;
let requests: { url: string; method: string; body: unknown }[];
let answers: Record<string, { status: number; body: unknown }>;
const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  requests.push({ url: input, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
  const answer = method === 'GET' ? { status: 200, body: { data: listed } } : answers[input] ?? { status: 200, body: { data: {} } };
  // Settled on the server: no longer listed when the list is read again.
  if (method === 'POST' && answer.status < 300) {
    if (input === '/api/inventory/g/review-ok') listed = { ...listed, counts: [] };
    else listed = { ...listed, merges: [] };
  }
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
});
const posts = () => requests.filter((request) => request.method === 'POST');

let queryClient: QueryClient;
beforeEach(() => {
  listed = { merges: [mergeCase()], counts: [countCase] };
  requests = [];
  answers = {
    '/api/products/merge': {
      status: 200,
      body: { data: { ...bordeaux, region: 'Graves' }, overLimits: { notes: false, tags: false }, removedProductIds: ['p2'], removedItemIds: [] },
    },
    '/api/products/distinctions': { status: 201, body: { data: { pairs: 1 } } },
    '/api/inventory/g/review-ok': { status: 200, body: { data: { ...countCase.group, needsReview: false } } },
  };
  vi.stubGlobal('fetch', fetchMock);
  toast.notifySuccess.mockClear();
  toast.notifyError.mockClear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { vi.unstubAllGlobals(); });

const renderScreen = () => render(<QueryClientProvider client={queryClient}><ReviewScreen /></QueryClientProvider>);
const radio = (name: string) => screen.getByRole('radio', { name: new RegExp(name) }) as HTMLInputElement;

describe('ReviewScreen — À regrouper ? (FEAT-102 c1-c3)', () => {
  it('c1: shows the families side by side with their bottles, and only the field in disagreement, pre-checked on the most recent', async () => {
    renderScreen();
    const card = await screen.findByTestId('review-merge-case');

    expect(within(card).getByRole('heading', { name: 'Cuvée X 2020' })).toBeInTheDocument();
    expect(within(card).getAllByTestId('review-merge-family').map((family) => family.textContent)).toEqual([
      expect.stringContaining('3 bouteilles'),
      expect.stringContaining('5 bouteilles'),
    ]);
    expect(within(card).getAllByRole('radiogroup')).toHaveLength(1);
    // Said in words, not by colour only.
    expect(within(card).getByText('Région')).toBeInTheDocument();
    expect(within(card).getByText('En désaccord')).toBeInTheDocument();
    expect(radio('Graves').checked).toBe(true);
    expect(radio('Bordeaux').checked).toBe(false);
  });

  it('c2: "Regrouper" asks first, with the real number of bottles, then merges with the values checked and says "Regroupé" without undo', async () => {
    renderScreen();
    await screen.findByTestId('review-merge-case');
    fireEvent.click(radio('Bordeaux'));

    fireEvent.click(screen.getByRole('button', { name: 'Regrouper' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Regrouper ces 2 vins en 1, 8 bouteilles ? Cette action est définitive.');
    expect(posts()).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Regrouper' }));

    await waitFor(() => expect(toast.notifySuccess).toHaveBeenCalledWith('review.merges.done'));
    expect(t('review.merges.done')).toBe('Regroupé');
    expect(posts()).toEqual([{ url: '/api/products/merge', method: 'POST', body: { productIds: ['p1', 'p2'], choices: { region: 'p1' } } }]);
    // The case leaves the screen at once; nothing offers to undo it.
    await waitFor(() => expect(screen.queryByTestId('review-merge-case')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('c2: one click on "Regrouper" then its confirmation is enough in the usual case (pre-checked values sent)', async () => {
    renderScreen();
    await screen.findByTestId('review-merge-case');
    fireEvent.click(screen.getByRole('button', { name: 'Regrouper' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Regrouper' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toEqual({ productIds: ['p1', 'p2'], choices: { region: 'p2' } });
  });

  it('says cigars in cigars, and references for the wines', async () => {
    listed = {
      merges: [mergeCase({ products: [{ ...bordeaux, category: 'cigar' }, { ...graves, category: 'cigar' }], units: 50 })],
      counts: [],
    };
    renderScreen();
    await screen.findByTestId('review-merge-case');
    fireEvent.click(screen.getByRole('button', { name: 'Regrouper' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Regrouper ces 2 références en 1, 50 cigares ? Cette action est définitive.');
  });

  it('warns when the merged notes or tags exceed what the description form accepts', async () => {
    answers['/api/products/merge'].body = { ...(answers['/api/products/merge'].body as object), overLimits: { notes: true, tags: false } };
    renderScreen();
    await screen.findByTestId('review-merge-case');
    fireEvent.click(screen.getByRole('button', { name: 'Regrouper' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Regrouper' }));

    expect(await screen.findByTestId('review-over-limits')).toHaveTextContent(
      '« Cuvée X 2020 » est regroupé. Ses notes dépassent 2 000 caractères : raccourcissez-les avant de modifier sa description.',
    );
  });

  it('a case changed meanwhile is said, and the list read again', async () => {
    answers['/api/products/merge'] = { status: 409, body: { error: 'DISTINCT_WINES' } };
    renderScreen();
    await screen.findByTestId('review-merge-case');
    const reads = () => requests.filter((request) => request.method === 'GET').length;
    const before = reads();
    fireEvent.click(screen.getByRole('button', { name: 'Regrouper' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Regrouper' }));

    await waitFor(() => expect(toast.notifyError).toHaveBeenCalledWith('review.errors.changed'));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('c3: "C\'est un autre vin" remembers the families as different wines and removes the case', async () => {
    renderScreen();
    await screen.findByTestId('review-merge-case');

    fireEvent.click(screen.getByRole('button', { name: "C'est un autre vin" }));

    await waitFor(() => expect(posts()).toEqual([{ url: '/api/products/distinctions', method: 'POST', body: { productIds: ['p1', 'p2'] } }]));
    await waitFor(() => expect(screen.queryByTestId('review-merge-case')).toBeNull());
    expect(toast.notifySuccess).toHaveBeenCalledWith('review.merges.keptApart');
  });

  it('families merely sharing the key show no field, still mergeable', async () => {
    listed = { merges: [mergeCase({ disagreements: [] })], counts: [] };
    renderScreen();
    await screen.findByTestId('review-merge-case');

    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText('Aucun champ en désaccord : ces fiches décrivent le même vin.')).toBeInTheDocument();
  });
});

describe('ReviewScreen — Nombres à vérifier (FEAT-102 c4)', () => {
  it('says what the update did in one sentence', async () => {
    renderScreen();
    const card = await screen.findByTestId('review-count-case');

    expect(within(card).getByRole('heading', { name: 'Cuvée Y 2018' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Avant la mise à jour : 6 bouteilles, finie. Glou a compté 1 bue + 5 pleines.');
    expect(card).toHaveTextContent('×5 · Garage');
  });

  it('"C\'est bon" changes nothing but the mark, and the case leaves the screen', async () => {
    renderScreen();
    await screen.findByTestId('review-count-case');

    fireEvent.click(screen.getByRole('button', { name: "C'est bon" }));

    await waitFor(() => expect(posts()).toEqual([{ url: '/api/inventory/g/review-ok', method: 'POST', body: undefined }]));
    await waitFor(() => expect(screen.queryByTestId('review-count-case')).toBeNull());
  });

  it('"Corriger le nombre" opens the correction of the group, from its number', async () => {
    renderScreen();
    await screen.findByTestId('review-count-case');

    fireEvent.click(screen.getByRole('button', { name: 'Corriger le nombre' }));

    expect(within(screen.getByRole('dialog')).getByText('Corriger le nombre')).toBeInTheDocument();
    expect(screen.getByTestId('correct-quantity-input')).toHaveValue(5);
  });
});

describe('ReviewScreen — nothing left (FEAT-102 c5)', () => {
  it('shows no case and says there is nothing to check', async () => {
    listed = { merges: [], counts: [] };
    renderScreen();

    expect(await screen.findByText('Rien à vérifier')).toBeInTheDocument();
    expect(screen.queryByText('À regrouper ?')).toBeNull();
    expect(screen.queryByText('Nombres à vérifier')).toBeNull();
  });
});
