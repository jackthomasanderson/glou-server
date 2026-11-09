'use client';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { importClient } from '@/lib/import/client';
import { CsvImportChoice, CsvImportPreview, CsvImportResult, CsvImportRow } from '@/lib/import/types';
import { notifyError } from '@/lib/toast';

/** Refusals of the confirmation that get their own message. */
const EXPLAINED_CONFIRM_ERRORS = new Set(['LINE_TOO_LARGE', 'QUANTITY_TOO_LARGE']);

// ─── CSV Import hooks (FEAT-56 Onboarding Setup Wizard) ─────────────────────

export function useCsvPreview() {
  return useMutation<CsvImportPreview, Error, File>({
    // Said by CsvImportStep.
    meta: { handlesError: true },
    mutationFn: (file) => importClient.previewCsv(file),
  });
}

const CSV_CONFIRM_KEY = ['import', 'csv-confirm'];

export function useCsvConfirm() {
  const queryClient = useQueryClient();
  return useMutation<CsvImportResult, Error, { rows: CsvImportRow[]; cellarId: string | null; choices?: CsvImportChoice[] }>({
    mutationKey: CSV_CONFIRM_KEY,
    meta: { handlesError: true },
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

/**
 * Review of #908: true while an import is being confirmed. A window holding
 * the import stays open meanwhile: closed, its "what was imported" would
 * never show and the member would import the file a second time.
 */
export function useCsvConfirmPending(): boolean {
  return useIsMutating({ mutationKey: CSV_CONFIRM_KEY }) > 0;
}
