import { useMutation } from '@tanstack/react-query';
import { notifyError } from '@/lib/toast';

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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glou-cellar-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => notifyError('gdpr.csvError'),
  });
}
