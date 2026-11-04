import { useMutation } from '@tanstack/react-query';
import { notifyError, notifySuccess } from '@/lib/toast';
import { CSV_IMPORT_MAX_ROWS } from '@shared/import';

/**
 * #471 (FEAT-99): downloads the cellar as a CSV the file import reads back.
 * The headers follow the interface language (the import knows both).
 */
export function useCsvExport() {
  return useMutation<void, Error, string>({
    mutationFn: async (language) => {
      const lang = language.startsWith('fr') ? 'fr' : 'en';
      const res = await fetch(`/api/inventory/export.csv?lang=${lang}`, { credentials: 'include' });
      if (!res.ok) throw new Error('CSV_EXPORT_FAILED');
      const rows = Number(res.headers?.get?.('X-Glou-Rows') ?? 0);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glou-cellar-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      // The file imports back 500 lines at a time: say so rather than let the import refuse it later.
      if (rows > CSV_IMPORT_MAX_ROWS) notifySuccess('gdpr.csvTooLong', { count: rows, max: CSV_IMPORT_MAX_ROWS });
    },
    onError: () => notifyError('gdpr.csvError'),
  });
}
