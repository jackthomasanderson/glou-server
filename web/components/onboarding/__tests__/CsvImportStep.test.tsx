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

const FILE = { missingColumns: [], unrecognizedColumns: [], unrecognizedCount: 0, outOfStockRows: 0 };
let previewResult: CsvImportPreview = { valid: [], errors: [], lines: [], newCellars: [], ...FILE };
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
function pickFile(rows: CsvImportRow[], options: { inStock?: Record<string, number>; newCellars?: string[]; preview?: Partial<CsvImportPreview> } = {}) {
  const lines = groupCsvRows(rows).map((line) => ({
    ...line,
    inStock: options.inStock?.[line.row.name] ?? 0,
    newCellar: line.row.cellar !== undefined && (options.newCellars ?? []).includes(line.row.cellar),
    tooLarge: line.count > 1000,
  }));
  previewResult = { valid: rows, errors: [], lines, newCellars: options.newCellars ?? [], ...FILE, ...options.preview };
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

    expect(screen.getByText('onboarding.csv.rowsToImport|12')).toBeInTheDocument();
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

// #1035: re-importing the same file said "295 valid rows · 1778 bottles" while every line was skipped.
describe('CsvImportStep counters (#1035)', () => {
  it('counts only the lines that will be added with the current choices', () => {
    pickFile([wine('Talbot', { quantity: 6 }), wine('Talbot', { quantity: 6 }), wine('Gloria', { quantity: 2 }), wine('Lynch', { quantity: 3 })], {
      inStock: { Talbot: 4, Gloria: 1 },
    });

    expect(screen.getByText('onboarding.csv.rowsToImport|1')).toBeInTheDocument();
    // The total (Lynch's 3 bottles), next to Lynch's own line.
    expect(screen.getAllByText('onboarding.csv.rowQuantity|3')).toHaveLength(2);
    expect(screen.queryByText('onboarding.csv.rowQuantity|17')).toBeNull();
    expect(screen.getByText('onboarding.csv.skippedRows|3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'onboarding.csv.addBottles|12' }));
    expect(screen.getByText('onboarding.csv.rowsToImport|3')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.rowQuantity|15')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.skippedRows|1')).toBeInTheDocument();
  });

  it('says that nothing will be added when every wine is already in the cellar, and keeps "Confirm" disabled', () => {
    pickFile([wine('Talbot', { quantity: 6 }), wine('Gloria')], { inStock: { Talbot: 4, Gloria: 1 } });

    expect(screen.getByText('onboarding.csv.rowsToImport|0')).toBeInTheDocument();
    expect(screen.queryByText('onboarding.csv.rowQuantity|7')).toBeNull();
    expect(screen.getByText('onboarding.csv.skippedRows|2')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.nothingToAdd')).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'onboarding.csv.addBottles|1' }));
    expect(screen.queryByText('onboarding.csv.nothingToAdd')).toBeNull();
    expect(confirmButton()).not.toBeDisabled();
  });
});

// #1035: a refused row named neither its column nor its wine; a missing column was said once per row.
describe('CsvImportStep refused rows and columns (#1035)', () => {
  it('names the row, the wine and the column of each refused row, in words', () => {
    pickFile([wine('Talbot')], {
      preview: {
        errors: [
          { row: 3, reason: 'INVALID_VINTAGE', column: 'Vintage', name: 'Krug' },
          { row: 4, reason: 'NAME_REQUIRED', column: 'Wine' },
          { row: 5, reason: 'INVALID_ROW', name: 'Gloria' },
          { row: 6, reason: 'INVALID_ROW' },
        ],
      },
    });

    expect(screen.getByText(/^onboarding\.csv\.errorReasonNamedColumn\|3\|Krug\|Vintage\|onboarding\.csv\.errorCodes\.INVALID_VINTAGE/)).toBeInTheDocument();
    expect(screen.getByText(/^onboarding\.csv\.errorReasonColumn\|4\|Wine\|onboarding\.csv\.errorCodes\.NAME_REQUIRED/)).toBeInTheDocument();
    expect(screen.getByText(/^onboarding\.csv\.errorReasonNamed\|5\|Gloria\|onboarding\.csv\.errorCodes\.INVALID_ROW/)).toBeInTheDocument();
    expect(screen.getByText(/^onboarding\.csv\.errorReason\|6\|onboarding\.csv\.errorCodes\.INVALID_ROW/)).toBeInTheDocument();
  });

  it('says once which required column is missing, and which columns were not recognized', () => {
    pickFile([], {
      preview: { errors: [{ row: 1, reason: 'MISSING_COLUMNS' }], missingColumns: ['category'], unrecognizedColumns: ['iWine', 'Score'], unrecognizedCount: 2 },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('onboarding.csv.errorCodes.MISSING_COLUMNS|1|onboarding.csv.requiredColumns.category');
    expect(screen.getByText('onboarding.csv.unrecognizedColumns|2|iWine, Score')).toBeInTheDocument();
    expect(screen.queryByText(/onboarding\.csv\.errorReason/)).toBeNull();
    // The header line is not a row: no "1 row with errors".
    expect(screen.queryByText(/onboarding\.csv\.errorRows/)).toBeNull();
    expect(confirmButton()).toBeDisabled();
  });

  it('says once that the header was not understood, as a message about the file, not a row', () => {
    pickFile([], { preview: { errors: [{ row: 1, reason: 'UNRECOGNIZED_COLUMNS' }], unrecognizedColumns: ['foo'], unrecognizedCount: 1 } });

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('onboarding.csv.errorCodes.UNRECOGNIZED_COLUMNS');
    expect(screen.queryByText(/onboarding\.csv\.errorReason/)).toBeNull();
    expect(screen.queryByText(/onboarding\.csv\.errorRows/)).toBeNull();
  });

  it('lists the columns left out of a file that imports, and how many more', () => {
    pickFile([wine('Talbot')], { preview: { unrecognizedColumns: ['iWine'], unrecognizedCount: 1 } });
    expect(screen.getByText('onboarding.csv.unrecognizedColumns|1|iWine')).toBeInTheDocument();
  });

  it('says how many headers it did not list', () => {
    pickFile([wine('Talbot')], { preview: { unrecognizedColumns: ['A', 'B'], unrecognizedCount: 35 } });
    expect(screen.getByText('onboarding.csv.unrecognizedColumnsMore|35|A, B|33')).toBeInTheDocument();
  });

  it('says how many wines of the file had no bottle left', () => {
    pickFile([wine('Talbot')], { preview: { outOfStockRows: 2 } });
    expect(screen.getByText('onboarding.csv.outOfStockRows|2')).toBeInTheDocument();
  });

  it('counts the refused rows apart from the rows already in the cellar', () => {
    pickFile([wine('Talbot')], { inStock: { Talbot: 1 }, preview: { errors: [{ row: 3, reason: 'INVALID_ROW' }] } });
    expect(screen.getByText('onboarding.csv.errorRows|1')).toBeInTheDocument();
    expect(screen.getByText('onboarding.csv.skippedRows|1')).toBeInTheDocument();
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
