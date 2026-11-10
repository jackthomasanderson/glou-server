import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #639: every failed scan said "try again with a sharper or better-lit photo",
// whatever the cause (service off, quota, photo too large, timeout), and the
// only way out was another photo. The message now follows the cause, and the
// error screen offers to enter the item by hand.

let uploadOutcome: { error: string } | { jobId: string } = { error: 'UNEXPECTED_ERROR' };
let polledJob: { status: 'failed'; errorMessage: string | null } | { status: 'done'; extractedData: Record<string, unknown> } | undefined;
const invalidateQueries = vi.fn();
const createItem = vi.fn();
const addToCollection = vi.fn();

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock('@/hooks/useScan', () => ({
  SCAN_STATUS_QUERY_KEY: ['scan-status'],
  useUploadScan: () => ({
    mutate: (_file: File, handlers: { onSuccess: (r: { jobId: string }) => void; onError: (e: Error) => void }) => {
      if ('error' in uploadOutcome) handlers.onError(new Error(uploadOutcome.error));
      else handlers.onSuccess({ jobId: uploadOutcome.jobId });
    },
  }),
  useScanJob: (jobId: string | null) => ({ data: jobId ? polledJob : undefined }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: [] }),
  useCreateInventoryItem: () => ({ mutateAsync: createItem, isPending: false }),
  useUpdateInventoryItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useCollections', () => ({ useAddItemsToCollection: () => ({ mutateAsync: addToCollection, isPending: false }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
// The full add form: a stand-in that submits a fixed item, with or without
// collections picked under "More details".
vi.mock('../InventoryForm', () => ({
  InventoryForm: ({ open, onSubmit }: { open: boolean; onSubmit: (v: object, c: string[]) => void }) =>
    open ? (
      <div data-testid="manual-form">
        <button type="button" onClick={() => onSubmit({ category: 'wine', name: 'Talbot', producer: 'Château Talbot' }, [])}>
          submit-manual
        </button>
        <button type="button" onClick={() => onSubmit({ category: 'wine', name: 'Talbot', producer: 'Château Talbot' }, ['col-gifts'])}>
          submit-manual-in-collection
        </button>
        <button type="button" onClick={() => onSubmit({ category: 'wine', name: 'Talbot', producer: 'Château Talbot', cellarId: null }, [])}>
          submit-manual-no-cellar
        </button>
      </div>
    ) : null,
}));
// FEAT-97: the wines of the same name the lookup answers (none unless a test says).
let sameName: Array<{ id: string; name: string; producer: string; vintage: number; category: string; items: unknown[] }> = [];
vi.mock('@/hooks/useKnownWine', () => ({ useKnownWine: (_fields: unknown, enabled: boolean) => (enabled ? sameName : []) }));
vi.mock('../KnownWineBanner', () => ({
  KnownWineBanner: ({ matches, onAdd, onDistinct }: { matches: Array<{ id: string }>; onAdd: (p: unknown) => void; onDistinct: () => void }) =>
    matches.length > 0 ? (
      <div data-testid="known-wine-banner">
        <button type="button" onClick={() => onAdd(matches[0])}>known-add</button>
        <button type="button" onClick={onDistinct}>known-distinct</button>
      </div>
    ) : null,
}));
// The reduced form: a stand-in whose "add" says the bottles were added.
vi.mock('../AddUnitsDialog', () => ({
  AddUnitsModal: ({ isOpen, product, onDone }: { isOpen: boolean; product: { name: string }; onDone: () => void }) =>
    isOpen ? <button type="button" onClick={onDone}>reduced-add {product.name}</button> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>{children}</button>
  ),
  ModalContent: ({ children }: { children?: ReactNode | (() => ReactNode) }) => (
    <>{typeof children === 'function' ? children() : children}</>
  ),
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Input: () => <input />,
  Select: () => <select />,
  SelectItem: () => null,
  Checkbox: () => <input type="checkbox" />,
  CircularProgress: () => <div />,
}));

import { ScanFlow } from '../ScanFlow';

const t = (key: string) => key;

function renderAndSendPhoto(defaultCellarId?: string) {
  const view = render(<ScanFlow open onClose={() => {}} defaultCellarId={defaultCellarId} t={t} />);
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'label.jpg', { type: 'image/jpeg' })] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  polledJob = undefined;
  sameName = [];
  createItem.mockResolvedValue({ id: 'i1', name: 'Talbot', producer: 'Château Talbot' });
  addToCollection.mockResolvedValue({});
});

describe('ScanFlow error message follows the cause (#639)', () => {
  it('says the recognition service is unavailable, without offering another photo', () => {
    uploadOutcome = { error: 'SCAN_UNAVAILABLE' };
    renderAndSendPhoto();
    expect(screen.getByRole('alert')).toHaveTextContent('scan.errors.unavailable');
    expect(screen.queryByRole('button', { name: 'scan.retry' })).toBeNull();
  });

  it('hides the scan entry points again when the service is found unavailable', () => {
    uploadOutcome = { error: 'SCAN_UNAVAILABLE' };
    renderAndSendPhoto();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['scan-status'] });
  });

  it('says to wait a few minutes when the scan quota is reached', () => {
    uploadOutcome = { error: 'SCAN_RATE_LIMITED' };
    renderAndSendPhoto();
    expect(screen.getByRole('alert')).toHaveTextContent('scan.errors.rateLimited');
    expect(screen.getByRole('button', { name: 'scan.retry' })).toBeInTheDocument();
  });

  it('says the photo was refused when it is too large', () => {
    uploadOutcome = { error: 'FILE_TOO_LARGE' };
    renderAndSendPhoto();
    expect(screen.getByRole('alert')).toHaveTextContent('scan.errors.photoRejected');
  });

  it('says the photo was refused when its format is not supported', () => {
    uploadOutcome = { error: 'INVALID_FILE_TYPE' };
    renderAndSendPhoto();
    expect(screen.getByRole('alert')).toHaveTextContent('scan.errors.photoRejected');
  });

  it('says the analysis took too long when the job timed out', () => {
    uploadOutcome = { jobId: 'j1' };
    polledJob = { status: 'failed', errorMessage: 'SCAN_TIMEOUT' };
    renderAndSendPhoto();
    expect(screen.getByRole('alert')).toHaveTextContent('scan.errors.timeout');
  });

  it('says the service is unavailable when the job could not reach it', () => {
    uploadOutcome = { jobId: 'j1' };
    polledJob = { status: 'failed', errorMessage: 'SCAN_UNAVAILABLE' };
    renderAndSendPhoto();
    expect(screen.getByRole('alert')).toHaveTextContent('scan.errors.unavailable');
  });

  it('falls back to a technical-failure message that does not blame the photo', () => {
    uploadOutcome = { jobId: 'j1' };
    polledJob = { status: 'failed', errorMessage: null };
    renderAndSendPhoto();
    expect(screen.getByRole('alert')).toHaveTextContent('scan.errors.failed');
  });
});

describe('ScanFlow error screen offers manual entry (#639)', () => {
  it('opens the add form from the error screen', () => {
    uploadOutcome = { error: 'SCAN_UNAVAILABLE' };
    renderAndSendPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'scan.enterManually' }));
    expect(screen.getByTestId('manual-form')).toBeInTheDocument();
  });

  it('adds the hand-entered item to the session list, without the failed job id', async () => {
    uploadOutcome = { jobId: 'j1' };
    polledJob = { status: 'failed', errorMessage: 'SCAN_TIMEOUT' };
    renderAndSendPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'scan.enterManually' }));
    fireEvent.click(screen.getByRole('button', { name: 'submit-manual' }));

    expect(await screen.findByText(/Talbot — Château Talbot/)).toBeInTheDocument();
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Talbot', scanJobId: undefined }));
  });

  it('comes back to manual entry, not to the camera, while the service is unavailable', async () => {
    uploadOutcome = { error: 'SCAN_UNAVAILABLE' };
    renderAndSendPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'scan.enterManually' }));
    fireEvent.click(screen.getByRole('button', { name: 'submit-manual' }));

    expect(await screen.findByText(/Talbot — Château Talbot/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'scan.enterManually' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'scan.capture.next' })).toBeNull();
  });

  it('files the hand-entered item in the first-run wizard cellar', async () => {
    uploadOutcome = { error: 'SCAN_UNAVAILABLE' };
    renderAndSendPhoto('cellar-1');
    fireEvent.click(screen.getByRole('button', { name: 'scan.enterManually' }));
    fireEvent.click(screen.getByRole('button', { name: 'submit-manual' }));

    expect(await screen.findByText(/Talbot — Château Talbot/)).toBeInTheDocument();
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ cellarId: 'cellar-1' }));
  });
});

// #471 (FEAT-97 c4): a label of a wine already known says "Vous avez déjà ce vin".
describe('ScanFlow — a wine already known (FEAT-97)', () => {
  const talbot = { id: 'p1', name: 'Talbot', producer: 'Château Talbot', vintage: 2015, category: 'wine', items: [] };
  const readLabel = () => {
    uploadOutcome = { jobId: 'j1' };
    polledJob = { status: 'done', extractedData: { category: 'wine', name: 'Talbot', producer: 'Château Talbot', vintage: 2015 } };
    renderAndSendPhoto();
  };

  it('adds the bottles to the known wine through the reduced form, and lists them', async () => {
    sameName = [talbot];
    readLabel();
    fireEvent.click(screen.getByRole('button', { name: 'known-add' }));
    fireEvent.click(screen.getByRole('button', { name: 'reduced-add Talbot' }));

    expect(await screen.findByText(/Talbot — Château Talbot/)).toBeInTheDocument();
    expect(screen.getByText('scan.cart.addedWine')).toBeInTheDocument();
    expect(createItem).not.toHaveBeenCalled();
  });

  it.each([
    ['spirit', 'scan.cart.addedSpirit'],
    ['cigar', 'scan.cart.addedCigar'],
  ])('says the bottles were added to your %s, in its own word', async (category, label) => {
    sameName = [{ ...talbot, category }];
    uploadOutcome = { jobId: 'j1' };
    polledJob = { status: 'done', extractedData: { category, name: 'Talbot', producer: 'Château Talbot' } };
    renderAndSendPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'known-add' }));
    fireEvent.click(screen.getByRole('button', { name: 'reduced-add Talbot' }));

    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText('scan.cart.addedWine')).toBeNull();
  });

  it('"C\'est un autre vin" creates a new wine, told apart from the known one', async () => {
    sameName = [talbot];
    readLabel();
    fireEvent.click(screen.getByRole('button', { name: 'known-distinct' }));
    expect(screen.queryByTestId('known-wine-banner')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'scan.review.confirm' }));

    expect(await screen.findByText(/Talbot — Château Talbot/)).toBeInTheDocument();
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Talbot', distinctFrom: ['p1'], scanJobId: 'j1' }));
  });
});

// #660, #690: the collections picked under "More details" were dropped by the
// scan, and its default-cellar rule was its own copy.
describe('ScanFlow — the full form saves as everywhere else (#690)', () => {
  it('files the item in the collections picked in the full form', async () => {
    uploadOutcome = { error: 'SCAN_UNAVAILABLE' };
    renderAndSendPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'scan.enterManually' }));
    fireEvent.click(screen.getByRole('button', { name: 'submit-manual-in-collection' }));

    expect(await screen.findByText(/Talbot — Château Talbot/)).toBeInTheDocument();
    expect(addToCollection).toHaveBeenCalledWith({ id: 'col-gifts', itemIds: ['i1'] });
  });

  it('keeps an explicit "No cellar" from the full form, even in the wizard', async () => {
    uploadOutcome = { error: 'SCAN_UNAVAILABLE' };
    renderAndSendPhoto('cellar-1');
    fireEvent.click(screen.getByRole('button', { name: 'scan.enterManually' }));
    fireEvent.click(screen.getByRole('button', { name: 'submit-manual-no-cellar' }));

    expect(await screen.findByText(/Talbot — Château Talbot/)).toBeInTheDocument();
    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ cellarId: null }));
  });
});
