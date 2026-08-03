'use client';
import { useRef, useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { CheckCircle2, Upload, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCsvConfirm, useCsvPreview } from '@/hooks/useImport';
import { CsvImportError, CsvImportRow } from '@/lib/import/types';

interface CsvImportStepProps {
  cellarId: string | null;
  onImported: (count: number) => void;
  onBack: () => void;
}

/**
 * Step 4/5 (CSV path) — file picker, server-side preview (valid/error rows),
 * then confirm-to-create. CSV only in this feature: Excel/.xlsx is an
 * explicitly assumed limitation, communicated via `csvOnlyHint` below.
 */
export function CsvImportStep({ cellarId, onImported, onBack }: CsvImportStepProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preview = useCsvPreview();
  const confirm = useCsvConfirm();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvImportRow[]>([]);
  const [errors, setErrors] = useState<CsvImportError[]>([]);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    preview.mutate(file, {
      onSuccess: (data) => { setRows(data.valid); setErrors(data.errors); },
      onError: () => { setRows([]); setErrors([]); },
    });
  };

  const handleConfirm = () => {
    confirm.mutate({ rows, cellarId }, { onSuccess: (res) => onImported(res.created) });
  };

  return (
    <div className="flex flex-col gap-5 py-8 px-6">
      <div className="text-center">
        <h2 className="text-lg font-bold">{t('onboarding.csv.title')}</h2>
        <p className="text-sm text-foreground-500 mt-1">{t('onboarding.csv.subtitle')}</p>
        <p className="text-xs text-foreground-400 mt-1">{t('onboarding.csv.csvOnlyHint')}</p>
      </div>

      {!fileName && (
        <div className="flex flex-col items-center gap-3 border-2 border-dashed border-default-300 rounded-xl py-8">
          <Upload size={28} className="text-foreground-400" />
          <Button
            color="primary"
            variant="bordered"
            radius="md"
            startContent={<Upload size={16} />}
            onPress={() => fileInputRef.current?.click()}
          >
            {t('onboarding.csv.chooseFile')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {fileName && (
        <>
          <div className="flex items-center justify-between bg-default-50 rounded-lg px-4 py-2">
            <span className="text-sm font-medium truncate">{fileName}</span>
            <Button size="sm" variant="light" onPress={reset} isDisabled={preview.isPending || confirm.isPending}>
              {t('onboarding.csv.chooseAnother')}
            </Button>
          </div>

          {preview.isPending && (
            <p className="text-sm text-foreground-500 text-center">{t('onboarding.csv.parsing')}</p>
          )}

          {preview.isError && (
            <p className="text-sm text-danger text-center">{t('status.error')}</p>
          )}

          {!preview.isPending && (rows.length > 0 || errors.length > 0) && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 justify-center flex-wrap">
                <Chip color="success" variant="flat" size="sm" startContent={<CheckCircle2 size={14} />}>
                  {t('onboarding.csv.validRows', { count: rows.length })}
                </Chip>
                {errors.length > 0 && (
                  <Chip color="warning" variant="flat" size="sm" startContent={<XCircle size={14} />}>
                    {t('onboarding.csv.errorRows', { count: errors.length })}
                  </Chip>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto border border-divider rounded-lg divide-y divide-divider">
                {rows.map((row, i) => (
                  <div key={`row-${i}`} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <span className="truncate">{row.name} — {row.producer}</span>
                    <span className="text-foreground-400 text-xs shrink-0">
                      {t(`categories.${row.category}`)}{row.vintage ? ` · ${row.vintage}` : ''}
                    </span>
                  </div>
                ))}
                {errors.map((e) => (
                  <div key={`err-${e.row}`} className="px-3 py-2 text-sm text-danger bg-danger-50">
                    {t('onboarding.csv.errorReason', {
                      row: e.row,
                      reason: t(`onboarding.csv.errorCodes.${e.reason}`, e.reason),
                    })}
                  </div>
                ))}
              </div>

              {rows.length === 0 && (
                <p className="text-sm text-warning-600 text-center">{t('onboarding.csv.noValidRows')}</p>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-between mt-2">
        <Button variant="light" onPress={onBack} isDisabled={confirm.isPending}>{t('onboarding.back')}</Button>
        <Button
          color="primary"
          variant="solid"
          isDisabled={rows.length === 0 || preview.isPending}
          isLoading={confirm.isPending}
          onPress={handleConfirm}
        >
          {t('onboarding.csv.confirmButton')}
        </Button>
      </div>
    </div>
  );
}
