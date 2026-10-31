'use client';
import { useRef, useState } from 'react';
import { Button, Chip, Radio, RadioGroup } from '@heroui/react';
import { CheckCircle2, Cigarette, Package, Upload, Warehouse, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CSV_IMPORT_MAX_COPIES, CSV_IMPORT_MAX_ROWS } from '@shared/import';
import { useCsvConfirm, useCsvPreview } from '@/hooks/useImport';
import { CsvImportError, CsvImportLine, CsvImportResult, CsvImportRow } from '@/lib/import/types';

/** Refusals of the uploaded file that get their own explanation (FEAT-91, #641). */
const EXPLAINED_UPLOAD_ERRORS = new Set(['FILE_TOO_LARGE', 'INVALID_FILE_TYPE']);

interface CsvImportStepProps {
  cellarId: string | null;
  onImported: (result: CsvImportResult) => void;
  onBack: () => void;
}

/** "6 bouteilles" or "25 cigares": what a line, or a total, stands for. */
const unitsKey = (kind: CsvImportLine['kind']) => (kind === 'cigar' ? 'onboarding.csv.rowCigars' : 'onboarding.csv.rowQuantity');

/**
 * Step 4/5 (CSV path) — file picker, server-side preview, then
 * confirm-to-create. CSV only in this feature: Excel/.xlsx is an explicitly
 * assumed limitation, communicated via `csvOnlyHint` below.
 *
 * #471 (FEAT-99): the preview lists the groups the import writes — identical
 * rows added up — and counts rows against the cap (500 rows, whatever the
 * bottles). A wine already in the cellar is marked, with "Add these N
 * bottles" / "Ignore (already counted)", Ignore chosen; a cellar the file
 * names that does not exist is announced, and created on confirmation.
 */
export function CsvImportStep({ cellarId, onImported, onBack }: CsvImportStepProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preview = useCsvPreview();
  const confirm = useCsvConfirm();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvImportRow[]>([]);
  const [lines, setLines] = useState<CsvImportLine[]>([]);
  const [errors, setErrors] = useState<CsvImportError[]>([]);
  /** Keys of the lines of a wine already in the cellar that the member chose to add. */
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  // A second click before the first one's answer must not send the import twice.
  const sending = useRef(false);
  const overLimit = rows.length > CSV_IMPORT_MAX_ROWS;
  const bottles = lines.reduce((n, line) => n + (line.kind === 'bottle' ? line.units : 0), 0);
  const cigars = lines.reduce((n, line) => n + (line.kind === 'cigar' ? line.units : 0), 0);
  const tooLarge = lines.some((line) => line.tooLarge);
  // The cellars created are those of the lines written: a wine already in
  // the cellar creates its cellar only once the member adds it (QP3).
  const newCellars = [...new Map(
    lines.flatMap(({ newCellar, inStock, key, row: { cellar } }) =>
      newCellar && cellar && (inStock === 0 || added.has(key)) ? [[cellar.trim().toLowerCase(), cellar.trim()] as const] : []),
  ).values()];

  const reset = () => {
    setFileName(null);
    setRows([]);
    setLines([]);
    setErrors([]);
    setAdded(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setAdded(new Set());
    preview.mutate(file, {
      onSuccess: (data) => {
        setRows(data.valid);
        setLines(data.lines);
        setErrors(data.errors);
      },
      onError: () => { setRows([]); setLines([]); setErrors([]); },
    });
  };

  const choose = (key: string, add: boolean) => {
    setAdded((current) => {
      const next = new Set(current);
      if (add) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleConfirm = () => {
    if (sending.current) return;
    sending.current = true;
    const choices = lines
      .filter((line) => line.inStock > 0)
      .map((line) => ({ key: line.key, inStock: line.inStock, add: added.has(line.key) }));
    confirm.mutate(
      { rows, cellarId, choices },
      {
        onSuccess: (result) => onImported(result),
        onSettled: () => { sending.current = false; },
      },
    );
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
            <p role="alert" className="text-sm text-danger text-center">
              {preview.error && EXPLAINED_UPLOAD_ERRORS.has(preview.error.message)
                ? t(`onboarding.csv.uploadErrors.${preview.error.message}`)
                : t('status.error')}
            </p>
          )}

          {!preview.isPending && (rows.length > 0 || errors.length > 0) && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 justify-center flex-wrap">
                <Chip color={overLimit ? 'danger' : 'success'} variant="flat" size="sm" startContent={<CheckCircle2 size={14} />}>
                  {t('onboarding.csv.validRows', { count: rows.length })}
                </Chip>
                {bottles > 0 && (
                  <Chip color="primary" variant="flat" size="sm" startContent={<Package size={14} />}>
                    {t('onboarding.csv.rowQuantity', { count: bottles })}
                  </Chip>
                )}
                {cigars > 0 && (
                  <Chip color="primary" variant="flat" size="sm" startContent={<Cigarette size={14} />}>
                    {t('onboarding.csv.rowCigars', { count: cigars })}
                  </Chip>
                )}
                {errors.length > 0 && (
                  <Chip color="warning" variant="flat" size="sm" startContent={<XCircle size={14} />}>
                    {t('onboarding.csv.errorRows', { count: errors.length })}
                  </Chip>
                )}
              </div>

              {newCellars.length > 0 && (
                <p className="text-sm text-foreground-600 flex items-center gap-2 justify-center">
                  <Warehouse size={16} className="text-primary shrink-0" />
                  {t('onboarding.csv.newCellars', { count: newCellars.length, names: newCellars.join(', ') })}
                </p>
              )}

              <ul className="max-h-72 overflow-y-auto border border-divider rounded-lg divide-y divide-divider">
                {lines.map((line) => (
                  <li key={line.key} className="px-3 py-2 text-sm flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{line.row.name} — {line.row.producer}</span>
                      <span className="text-foreground-400 text-xs shrink-0 flex items-center gap-2">
                        {line.units > 1 && (
                          <span className="font-medium text-foreground-600">{t(unitsKey(line.kind), { count: line.units })}</span>
                        )}
                        {line.rowCount > 1 && <span>{t('onboarding.csv.mergedRows', { count: line.rowCount })}</span>}
                        <span>
                          {t(`categories.${line.row.category}`)}
                          {line.row.vintage ? ` · ${line.row.vintage}` : ''}
                          {line.row.cellar ? ` · ${line.row.cellar}` : ''}
                        </span>
                      </span>
                    </div>
                    {line.tooLarge && (
                      <span role="alert" className="text-xs text-danger">
                        {t(line.kind === 'cigar' ? 'onboarding.csv.lineTooLargeCigars' : 'onboarding.csv.lineTooLarge', { total: line.count, max: CSV_IMPORT_MAX_COPIES })}
                      </span>
                    )}
                    {line.inStock > 0 && (
                      <div className="flex flex-col gap-1 bg-warning-50 rounded-md px-2 py-1">
                        <span className="text-xs font-medium text-warning-700">
                          {t(line.kind === 'cigar' ? 'onboarding.csv.alreadyInCellarCigars' : 'onboarding.csv.alreadyInCellar', { count: line.inStock })}
                        </span>
                        <RadioGroup
                          size="sm"
                          orientation="horizontal"
                          aria-label={t('onboarding.csv.alreadyInCellarChoice', { name: line.row.name })}
                          value={added.has(line.key) ? 'add' : 'ignore'}
                          onValueChange={(value) => choose(line.key, value === 'add')}
                        >
                          <Radio value="add">
                            {t(line.kind === 'cigar' ? 'onboarding.csv.addCigars' : 'onboarding.csv.addBottles', { count: line.units })}
                          </Radio>
                          <Radio value="ignore">
                            {t(line.kind === 'cigar' ? 'onboarding.csv.ignoreCigars' : 'onboarding.csv.ignoreBottles')}
                          </Radio>
                        </RadioGroup>
                      </div>
                    )}
                  </li>
                ))}
                {errors.map((e) => (
                  <li key={`err-${e.row}`} className="px-3 py-2 text-sm text-danger bg-danger-50">
                    {t('onboarding.csv.errorReason', {
                      row: e.row,
                      reason: t(`onboarding.csv.errorCodes.${e.reason}`, e.reason),
                    })}
                  </li>
                ))}
              </ul>

              {rows.length === 0 && (
                <p className="text-sm text-warning-600 text-center">{t('onboarding.csv.noValidRows')}</p>
              )}

              {overLimit && (
                <p role="alert" className="text-sm text-danger text-center">
                  {t('onboarding.csv.tooManyRows', { count: rows.length, max: CSV_IMPORT_MAX_ROWS })}
                </p>
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
          isDisabled={rows.length === 0 || overLimit || tooLarge || preview.isPending}
          isLoading={confirm.isPending}
          onPress={handleConfirm}
        >
          {t('onboarding.csv.confirmButton')}
        </Button>
      </div>
    </div>
  );
}
