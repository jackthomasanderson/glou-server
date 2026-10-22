import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #639: every failed scan said "try again with a sharper or better-lit photo",
// whatever the cause (service off, quota, photo too large, timeout), and the
// only way out was another photo. The message now follows the cause, and the
// error screen offers to enter the item by hand.

let uploadOutcome: { error: string } | { jobId: string } = { error: 'UNEXPECTED_ERROR' };
let polledJob: { status: 'failed'; errorMessage: string | null } | undefined;
const invalidateQueries = vi.fn();
const createItem = vi.fn();

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
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
// The full add form: a stand-in that submits a fixed item.
vi.mock('../InventoryForm', () => ({
  InventoryForm: ({ open, onSubmit }: { open: boolean; onSubmit: (v: object) => void }) =>
    open ? (
      <div data-testid="manual-form">
        <button type="button" onClick={() => onSubmit({ category: 'wine', name: 'Talbot', producer: 'Château Talbot' })}>
          submit-manual
        </button>
      </div>
    ) : null,
}));
vi.mock('../DuplicateDialog', () => ({ DuplicateDialog: () => null }));
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

function renderAndSendPhoto() {
  const view = render(<ScanFlow open onClose={() => {}} t={t} />);
  const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'label.jpg', { type: 'image/jpeg' })] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  polledJob = undefined;
  createItem.mockResolvedValue({ id: 'i1', name: 'Talbot', producer: 'Château Talbot' });
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
});
