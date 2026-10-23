'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importClient } from '@/lib/import/client';
import { CsvImportPreview, CsvImportRow } from '@/lib/import/types';
import { notifyError } from '@/lib/toast';

// ─── CSV Import hooks (FEAT-56 Onboarding Setup Wizard) ─────────────────────

export function useCsvPreview() {
  return useMutation<CsvImportPreview, Error, File>({
    mutationFn: (file) => importClient.previewCsv(file),
  });
}

export function useCsvConfirm() {
  const queryClient = useQueryClient();
  return useMutation<{ created: number; skippedDuplicates: number }, Error, { rows: CsvImportRow[]; cellarId: string | null }>({
    mutationFn: ({ rows, cellarId }) => importClient.confirmCsv(rows, cellarId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['cellars'] });
    },
    // FEAT-91 (#641): a failed import used to just stop the button spinning.
    onError: () => notifyError('onboarding.csv.confirmError'),
  });
}
