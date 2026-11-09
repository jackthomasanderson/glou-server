import type { CsvImportResult } from './types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** #471 (FEAT-99): what a file import wrote — "6 bouteilles · 1 vin" — or '' when nothing. */
export function importedText(result: CsvImportResult, t: Translate): string {
  return [
    result.bottles > 0 && t('onboarding.summary.bottles', { count: result.bottles }),
    result.wines > 0 && t('onboarding.summary.wines', { count: result.wines }),
    result.cigars > 0 && t('onboarding.summary.cigars', { count: result.cigars }),
    result.cigarReferences > 0 && t('onboarding.summary.cigarReferences', { count: result.cigarReferences }),
  ].filter(Boolean).join(' · ');
}
