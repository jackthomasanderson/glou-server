import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CsvImportPreview, CsvImportRow } from '@/lib/import/types';

// #471 (FEAT-99): the preview lists the groups the import writes, counts
// rows against the 500-row cap whatever the bottles, marks a wine already in
// the cellar with "Ignore" chosen, announces the cellars it will create, and
// a double click on "Confirm" sends the import once.

vi.mock('react-i18next', () => ({
  // Renders "key|value|value…" so the test sees which count reached which text.
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? [k, ...Object.values(o)].join('|') : k),
  }),
}));

let previewResult: CsvImportPreview = { valid: [], errors: [], lines: [], newCellars: [] };
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
import { groupCsvRows } from '@shared/import';

const wine = (name: string, extra: Partial<CsvImportRow> = {}): CsvImportRow => ({
  name, producer: 'Domaine', category: 'wine', ...extra,
});

/** A preview as the server answers it: the rows grouped, `inStock` per wine name, cellars to create. */
function pickFile(rows: CsvImportRow[], options: { inStock?: Record<string, number>; newCellars?: string[] } = {}) {
  const lines = groupCsvRows(rows).map((line) => ({
    ...line,
    inStock: options.inStock?.[line.row.name] ?? 0,
    newCellar: line.row.cellar !== undefined && (options.newCellars ?? []).includes(line.row.cellar),
    tooLarge: line.count > 1000,
  }));
  previewResult = { valid: rows, errors: [], lines, newCellars: options.newCellars ?? [] };
  const onImported = vi.fn();
  const { container } = render(<CsvImportStep cellarId="c1" onImported={onImported} onBack={() => {}} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['x'], 'cave.csv', { type: 'text/csv' })] } });
  return { lines, onImported };
}

const confirmButton = () => screen.getByRole('button', { name: 'onboarding.csv.confirmButton' });

beforeEach(() => {
  vi.clearAllMocks();
  previewError = null;
});

describe('CsvImportStep preview (FEAT-99)', () => {
  it('counts rows and the bottles they stand for, and adds up identical rows', () => {
    pickFile([wine('Talbot', { quantity: 3 }), wine('Talbot', { quantity: 3 }), ...Array.from({ length: 10 }, (_, i) => wine(`Wine ${i}`))]);

    expect(screen.getByText('onboarding.csv.validRows|12')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.rowQuantity|16')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.rowQuantity|6')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.mergedRows|2')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
    expect(confirmButton()).not.toBeDisabled();
  });

  it('counts cigars apart: 3 boxes of 25', () => {
    pickFile([{ name: 'Robusto', producer: 'Cohiba', category: 'cigar', quantity: 3, cigarsPerBox: 25 }]);

    expect(screen.getAllByText('onboarding.csv.rowCigars|75')).toHaveLength(2);
    expect(screen.queryByText(/onboarding\.csv\.rowQuantity/)).toBeNull();
  });

  // FEAT-99 c4, decision 39.
  it('lets 500 rows through whatever the bottles they stand for', () => {
    pickFile(Array.from({ length: 500 }, (_, i) => wine(`Wine ${i}`, { quantity: 12 })));

    expect(screen.queryByText(/onboarding\.csv\.tooManyRows/)).toBeNull();
    expect(confirmButton()).not.toBeDisabled();
  });

  it('refuses 501 rows and says so, instead of importing part of the file', () => {
    pickFile(Array.from({ length: 501 }, (_, i) => wine(`Wine ${i}`)));

    expect(screen.getByText('onboarding.csv.tooManyRows|501|500')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(confirmMutate).not.toHaveBeenCalled();
  });

  // QP3.
  it('announces the cellars the import will create', () => {
    pickFile([wine('Talbot', { cellar: 'Cuisine' })], { newCellars: ['Cuisine'] });

    expect(screen.getByText('onboarding.csv.newCellars|1|Cuisine')).toBeInTheDocument();
  });

  it('announces the cellar of a wine already in the cellar only once the member adds it', () => {
    pickFile([wine('Talbot', { cellar: 'Cuisine' })], { newCellars: ['Cuisine'], inStock: { Talbot: 2 } });

    expect(screen.queryByText(/onboarding\.csv\.newCellars/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'onboarding.csv.addBottles|1' }));
    expect(screen.getByText('onboarding.csv.newCellars|1|Cuisine')).toBeInTheDocument();
  });

  // Review of #794: identical rows past one group's bound are said before confirming.
  it('marks identical rows that add up past 1,000 and keeps "Confirm" disabled', () => {
    pickFile([wine('Talbot', { quantity: 600 }), wine('Talbot', { quantity: 600 })]);

    expect(screen.getByText('onboarding.csv.lineTooLarge|1200|1000')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});

// Point 37: "Vin déjà en cave", Ignore chosen by default.
describe('CsvImportStep wine already in the cellar (FEAT-99 c2)', () => {
  it('marks the line and sends "ignore" unless the member changes it', () => {
    const { lines } = pickFile([wine('Talbot', { quantity: 6 }), wine('Gloria')], { inStock: { Talbot: 4 } });

    expect(screen.getByText('onboarding.csv.alreadyInCellar|4')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'onboarding.csv.ignoreBottles' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'onboarding.csv.addBottles|6' })).not.toBeChecked();

    fireEvent.click(confirmButton());
    expect(confirmMutate).toHaveBeenCalledWith(
      { rows: previewResult.valid, cellarId: 'c1', choices: [{ key: lines[0].key, inStock: 4, add: false }] },
      expect.anything(),
    );
  });

  it('sends "add" once the member chose to add these bottles', () => {
    const { lines } = pickFile([wine('Talbot', { quantity: 6 })], { inStock: { Talbot: 4 } });

    fireEvent.click(screen.getByRole('radio', { name: 'onboarding.csv.addBottles|6' }));
    fireEvent.click(confirmButton());

    expect(confirmMutate.mock.calls[0]?.[0].choices).toEqual([{ key: lines[0].key, inStock: 4, add: true }]);
  });
});

describe('CsvImportStep confirmation', () => {
  it('sends the import once on a double click, and hands its result on', () => {
    const { onImported } = pickFile([wine('Talbot', { quantity: 6 })]);

    fireEvent.click(confirmButton());
    fireEvent.click(confirmButton());

    expect(confirmMutate).toHaveBeenCalledTimes(1);
    const result = { bottles: 6, wines: 1, cigars: 0, cigarReferences: 0, skippedLines: 0, skippedUnits: 0, staleLines: 0, createdCellars: [] };
    const { onSuccess, onSettled } = confirmMutate.mock.calls[0]?.[1] as { onSuccess: (r: typeof result) => void; onSettled: () => void };
    onSuccess(result);
    onSettled();
    expect(onImported).toHaveBeenCalledWith(result);
  });

  it('can be sent again after a failure', () => {
    pickFile([wine('Talbot')]);

    fireEvent.click(confirmButton());
    (confirmMutate.mock.calls[0]?.[1] as { onSettled: () => void }).onSettled();
    fireEvent.click(confirmButton());

    expect(confirmMutate).toHaveBeenCalledTimes(2);
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
