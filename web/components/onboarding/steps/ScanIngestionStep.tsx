'use client';
import { useTranslation } from 'react-i18next';
import { ScanFlow } from '@/components/inventory/ScanFlow';

interface ScanIngestionStepProps {
  cellarId: string | null;
  onItemAdded: () => void;
  onDone: () => void;
}

/**
 * Step 4/5 (scan path, FEAT-04) — thin wrapper mounting the shared
 * `ScanFlow` (same component used from the main inventory dashboard) as
 * "always open" for the duration of this step. Closing it (X or "Terminer")
 * moves the wizard on to the summary step; each committed item bumps the
 * wizard's running `itemsAdded` counter via `onItemAdded`, mirroring
 * `ManualIngestionStep`/`CsvImportStep`'s shape.
 */
export function ScanIngestionStep({ cellarId, onItemAdded, onDone }: ScanIngestionStepProps) {
  const { t } = useTranslation();

  return (
    <ScanFlow
      open
      onClose={onDone}
      defaultCellarId={cellarId}
      onItemCommitted={onItemAdded}
      t={t}
    />
  );
}
