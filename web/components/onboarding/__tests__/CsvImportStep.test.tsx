import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CsvImportPreview, CsvImportRow } from '@/lib/import/types';

// FEAT-91: the preview says how many items the file will create (a wine row
// with quantity 6 is 6 bottles), and refuses a file over the import cap
// instead of cutting it short without a word (#577, #641).

vi.mock('react-i18next', () => ({
  // Renders "key|value|value…" so the test sees which count reached which text.
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? [k, ...Object.values(o)].join('|') : k),
  }),
}));

let previewResult: CsvImportPreview = { valid: [], errors: [] };
let previewError: Error | null = null;
const confirmMutate = vi.fn();
vi.mock('@/hooks/useImport', () => ({
  useCsvPreview: () => ({
    mutate: (_file: File, { onSuccess }: { onSuccess: (data: CsvImportPreview) => void }) => {
      if (!previewError) onSuccess(previewResult);
    },
    isPending: false,
    isError: previewError !== null,
    error: previewError,
  }),
  useCsvConfirm: () => ({ mutate: confirmMutate, isPending: false }),
}));

import { CsvImportStep } from '../steps/CsvImportStep';

const wine = (name: string, extra: Partial<CsvImportRow> = {}): CsvImportRow => ({
  name, producer: 'Domaine', category: 'wine', ...extra,
});

function pickFile(rows: CsvImportRow[]) {
  previewResult = { valid: rows, errors: [] };
  const { container } = render(<CsvImportStep cellarId="c1" onImported={() => {}} onBack={() => {}} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'cave.csv', { type: 'text/csv' })] } });
}

const confirmButton = () => screen.getByRole('button', { name: 'onboarding.csv.confirmButton' });

beforeEach(() => {
  vi.clearAllMocks();
  previewError = null;
});

describe('CsvImportStep preview (FEAT-91)', () => {
  it('counts the bottles a quantity stands for, next to the valid rows', () => {
    pickFile([wine('Talbot', { quantity: 6 }), ...Array.from({ length: 11 }, (_, i) => wine(`Wine ${i}`))]);

    expect(screen.getByText('onboarding.csv.validRows|12')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.itemsToImport|17')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.rowQuantity|6')).toBeInTheDocument();
    expect(confirmButton()).not.toBeDisabled();
  });

  it('counts a cigar row as one box, without a bottle quantity', () => {
    pickFile([{ name: 'Robusto', producer: 'Cohiba', category: 'cigar', quantity: 25 }]);

    expect(screen.getByText('onboarding.csv.itemsToImport|1')).toBeInTheDocument();
    expect(screen.queryByText(/onboarding\.csv\.rowQuantity/)).toBeNull();
  });

  it('refuses a file over the cap and says by how much, instead of importing part of it', () => {
    pickFile([wine('Talbot', { quantity: 300 }), wine('Gloria', { quantity: 201 })]);

    expect(screen.getByText('onboarding.csv.tooManyItems|501|500')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(confirmMutate).not.toHaveBeenCalled();
  });

  it('still lets a file right at the cap through', () => {
    pickFile([wine('Talbot', { quantity: 300 }), wine('Gloria', { quantity: 200 })]);

    expect(screen.queryByText(/onboarding\.csv\.tooManyItems/)).toBeNull();
    expect(confirmButton()).not.toBeDisabled();
  });
});

describe('CsvImportStep refused file (FEAT-91, #641)', () => {
  it('says why the server refused the file', () => {
    previewError = new Error('FILE_TOO_LARGE');
    pickFile([]);

    expect(screen.getByText('onboarding.csv.uploadErrors.FILE_TOO_LARGE')).toBeInTheDocument();
  });

  it('falls back to the generic message for an unexpected failure', () => {
    previewError = new Error('UNEXPECTED_ERROR');
    pickFile([]);

    expect(screen.getByText('status.error')).toBeInTheDocument();
  });
});
