'use client';
import React from 'react';
import { Chip } from '@heroui/react';
import { FileSpreadsheet, ScanLine } from 'lucide-react';
import type { FieldSource } from '@/lib/inventory/types';

// FEAT-05: where a value came from. 'manual' is the implicit default and is never flagged.
const SOURCE_ICONS: Record<Exclude<FieldSource, 'manual'>, React.ReactElement> = {
  import_csv: <FileSpreadsheet size={11} />,
  ocr: <ScanLine size={11} />,
};

export function FieldSourceBadge({ source, t }: { source: string | undefined | null; t: (key: string) => string }) {
  if (!source || !(source in SOURCE_ICONS)) return null;
  const known = source as Exclude<FieldSource, 'manual'>;
  return (
    <Chip
      size="sm"
      variant="flat"
      color="default"
      radius="full"
      startContent={SOURCE_ICONS[known]}
      className="h-4 px-1.5 gap-1 text-xs font-semibold shrink-0"
      data-testid={`field-source-${known}`}
    >
      {t(`traceability.source.${known}`)}
    </Chip>
  );
}
