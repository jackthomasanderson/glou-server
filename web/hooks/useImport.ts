'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importClient } from '@/lib/import/client';
import { CsvImportChoice, CsvImportPreview, CsvImportResult, CsvImportRow } from '@/lib/import/types';
import { notifyError } from '@/lib/toast';

/** Refusals of the confirmation that get their own message. */
const EXPLAINED_CONFIRM_ERRORS = new Set(['LINE_TOO_LARGE', 'QUANTITY_TOO_LARGE']);

// ─── CSV Import hooks (FEAT-56 Onboarding Setup Wizard) ─────────────────────

export function useCsvPreview() {
  return useMutation<CsvImportPreview, Error, File>({
    mutationFn: (file) => importClient.previewCsv(file),
  });
}

export function useCsvConfirm() {
  const queryClient = useQueryClient();
  return useMutation<CsvImportResult, Error, { rows: CsvImportRow[]; cellarId: string | null; choices?: CsvImportChoice[] }>({
    mutationFn: ({ rows, cellarId, choices }) => importClient.confirmCsv(rows, cellarId, choices),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
    // FEAT-91 (#641): a failed import used to just stop the button spinning.
    // #471 (FEAT-99): a group the import would push past 1,000 copies gets its own explanation.
    onError: (error) => notifyError(
      EXPLAINED_CONFIRM_ERRORS.has(error.message) ? `onboarding.csv.confirmErrors.${error.message}` : 'onboarding.csv.confirmError',
    ),
  });
}
