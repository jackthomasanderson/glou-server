'use client';
import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardBody, Button, Checkbox, CircularProgress, Chip, RadioGroup, Radio } from '@heroui/react';
import { CheckCircle2, AlertTriangle, HelpCircle, PlusCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountSession, CountLine, CountUnexpectedItem } from '@/lib/inventory-count/types';
import {
  buildCorrections, defaultFindChoice, missingChoices, type FindChoice, type MissingChoice,
} from '@/lib/inventory-count/corrections';
import { useSessionReport, useCompleteCountSession } from '@/hooks/useInventoryCount';

interface SessionReportViewProps {
  session: CountSession;
}

/** The value of the "new wine" radio (a find not joined to a known wine). */
const NEW_WINE = 'new';

function toggleId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function SessionReportView({ session }: SessionReportViewProps) {
  const { t } = useTranslation();
  const { data: report, isLoading } = useSessionReport(session.id);
  const completeMutation = useCompleteCountSession(session.id);

  // #471 (FEAT-100): one choice per missing line, keyed by its id.
  const [missing, setMissing] = useState<Record<string, MissingChoice>>({});
  const [surplus, setSurplus] = useState<Set<string>>(new Set());
  const [move, setMove] = useState<Set<string>>(new Set());
  // Keyed by entryId, not itemId — a new find has no itemId yet (that's the
  // whole point of "ajouter au stock", see types.ts#CountUnexpectedItem).
  const [finds, setFinds] = useState<Record<string, FindChoice>>({});
  const [error, setError] = useState<string | null>(null);

  const findChoice = (find: CountUnexpectedItem): FindChoice => finds[find.entryId] ?? defaultFindChoice(find);
  // From the latest state, never from the render's closure (a control may keep its first handler).
  const updateFind = (find: CountUnexpectedItem, change: (choice: FindChoice) => FindChoice) =>
    setFinds((prev) => ({ ...prev, [find.entryId]: change(prev[find.entryId] ?? defaultFindChoice(find)) }));
  const corrections = useMemo(() => {
    const findChoices = Object.fromEntries((report?.unexpected ?? [])
      .filter((find) => find.itemId === null)
      .map((find) => [find.entryId, finds[find.entryId] ?? defaultFindChoice(find)]));
    return buildCorrections({ missing, surplus, move, finds: findChoices });
  }, [report, missing, surplus, move, finds]);

  const handleClose = async () => {
    setError(null);
    try {
      await completeMutation.mutateAsync(corrections);
      setMissing({});
      setSurplus(new Set());
      setMove(new Set());
      setFinds({});
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
      const key = `inventoryCount.errors.${code}`;
      const translated = t(key);
      setError(translated === key ? t('inventoryCount.errors.UNEXPECTED_ERROR') : translated);
    }
  };

  if (isLoading || !report) {
    return (
      <div className="flex justify-center p-8" role="status" aria-live="polite">
        <CircularProgress aria-label={t('status.loading')} />
      </div>
    );
  }

  const isCompleted = session.status === 'completed';
  const lineTitle = (line: Pick<CountLine, 'name' | 'producer'>) => (
    <>
      <p className="text-sm font-medium truncate">{line.name}</p>
      {line.producer && <p className="text-xs text-foreground-400 truncate">{line.producer}</p>}
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Counts, in bottles (copies), not lines */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          ['confirmed', report.counts.confirmed, 'text-success-700'],
          ['missing', report.counts.missing, 'text-warning-700'],
          ['surplus', report.counts.surplus, 'text-primary'],
          ['unexpected', report.counts.unexpected, 'text-danger'],
        ] as const).map(([key, value, color]) => (
          <Card key={key} radius="lg" shadow="sm">
            <CardBody className="items-center text-center gap-1 py-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-foreground-500">{t(`inventoryCount.report.${key}`)}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Confirmed */}
        <Card radius="lg" shadow="sm">
          <CardHeader className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-success" />
            <span className="text-sm font-semibold">{t('inventoryCount.report.confirmed')}</span>
          </CardHeader>
          <CardBody className="gap-3 pt-0 max-h-80 overflow-y-auto">
            {report.confirmed.length === 0 ? (
              <p className="text-xs text-foreground-400">{t('inventoryCount.report.none')}</p>
            ) : (
              report.confirmed.map((line) => (
                <div key={line.id} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">{lineTitle(line)}</div>
                  {line.expectedQuantity > 1 && (
                    <Chip size="sm" variant="flat" color="success" className="shrink-0">
                      {t('inventoryCount.report.foundOf', { found: line.foundQuantity, expected: line.expectedQuantity })}
                    </Chip>
                  )}
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Missing — "Bues" or "Corriger le nombre" with its reason, for the missing copies only */}
        <Card radius="lg" shadow="sm" className="border border-warning-200">
          <CardHeader className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning" />
            <span className="text-sm font-semibold">{t('inventoryCount.report.missing')}</span>
          </CardHeader>
          <CardBody className="gap-4 pt-0 max-h-96 overflow-y-auto">
            {report.missing.length === 0 ? (
              <p className="text-xs text-foreground-400">{t('inventoryCount.report.none')}</p>
            ) : (
              report.missing.map((line) => (
                <div key={line.id} className="flex flex-col gap-1">
                  {lineTitle(line)}
                  {line.expectedQuantity > 1 && (
                    <p className="text-xs text-warning-600">
                      {t('inventoryCount.report.missingOf', { count: line.missingQuantity, expected: line.expectedQuantity })}
                    </p>
                  )}
                  <RadioGroup
                    size="sm"
                    orientation="horizontal"
                    aria-label={t('inventoryCount.report.missingChoiceAria', { name: line.name })}
                    value={missing[line.id] ?? 'none'}
                    onValueChange={(value) => setMissing((prev) => ({ ...prev, [line.id]: value as MissingChoice }))}
                    isDisabled={isCompleted}
                  >
                    {missingChoices(line).map((choice) => (
                      <Radio key={choice} value={choice}>
                        {t(`inventoryCount.report.choice.${choice}`, { count: line.missingQuantity })}
                      </Radio>
                    ))}
                  </RadioGroup>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Surplus — the copies found in excess complete their group */}
        <Card radius="lg" shadow="sm" className="border border-primary-200">
          <CardHeader className="flex items-center gap-2">
            <PlusCircle size={16} className="text-primary" />
            <span className="text-sm font-semibold">{t('inventoryCount.report.surplus')}</span>
          </CardHeader>
          <CardBody className="gap-3 pt-0 max-h-80 overflow-y-auto">
            {report.surplus.length === 0 ? (
              <p className="text-xs text-foreground-400">{t('inventoryCount.report.none')}</p>
            ) : (
              report.surplus.map((line) => (
                <div key={line.id} className="flex items-start gap-2">
                  <Checkbox
                    size="sm"
                    isSelected={surplus.has(line.id)}
                    onValueChange={() => setSurplus((prev) => toggleId(prev, line.id))}
                    isDisabled={isCompleted}
                    aria-label={t('inventoryCount.report.addSurplus', { count: line.surplusQuantity, name: line.name })}
                  />
                  <div className="flex-1 min-w-0">
                    {lineTitle(line)}
                    <p className="text-xs text-primary mt-0.5">
                      {t('inventoryCount.report.addSurplus', { count: line.surplusQuantity, name: line.name })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Unexpected — move_to_scope (existing item found elsewhere) or
            add_to_stock (a find: a new wine, or copies of a known one) */}
        <Card radius="lg" shadow="sm" className="border border-danger-200">
          <CardHeader className="flex items-center gap-2">
            <HelpCircle size={16} className="text-danger" />
            <span className="text-sm font-semibold">{t('inventoryCount.report.unexpected')}</span>
          </CardHeader>
          <CardBody className="gap-4 pt-0 max-h-96 overflow-y-auto">
            {report.unexpected.length === 0 ? (
              <p className="text-xs text-foreground-400">{t('inventoryCount.report.none')}</p>
            ) : (
              report.unexpected.map((item) => {
                const isNewFind = item.itemId === null;
                const choice = findChoice(item);
                const addLabel = isNewFind ? t('inventoryCount.report.addToStock', { count: item.quantity ?? 1 }) : t('inventoryCount.report.moveToScope');
                return (
                  <div key={item.entryId} className="flex items-start gap-2">
                    <Checkbox
                      size="sm"
                      isSelected={isNewFind ? choice.add : move.has(item.itemId as string)}
                      onValueChange={() =>
                        isNewFind
                          ? updateFind(item, (current) => ({ ...current, add: !current.add }))
                          : setMove((prev) => toggleId(prev, item.itemId as string))
                      }
                      isDisabled={isCompleted || (!isNewFind && !session.cellarId)}
                      aria-label={`${addLabel} — ${item.name}`}
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        {isNewFind && (
                          <Chip size="sm" variant="flat" color="default" className="shrink-0">
                            {t('inventoryCount.report.newItemBadge')}
                          </Chip>
                        )}
                      </div>
                      {item.producer && <p className="text-xs text-foreground-400 truncate">{item.producer}</p>}
                      <p className="text-xs text-danger-600">
                        {isNewFind || session.cellarId ? addLabel : t('inventoryCount.report.moveDisabledNoCellar')}
                      </p>
                      {isNewFind && item.matchingProducts.length > 0 && (
                        <RadioGroup
                          size="sm"
                          label={t('inventoryCount.report.joinLabel')}
                          value={choice.productId ?? NEW_WINE}
                          onValueChange={(value) =>
                            updateFind(item, (current) => ({ ...current, productId: value === NEW_WINE ? null : value }))
                          }
                          isDisabled={isCompleted}
                        >
                          {item.matchingProducts.map((product) => (
                            <Radio key={product.id} value={product.id}>
                              {[product.name, product.producer, product.vintage].filter(Boolean).join(' · ')}
                            </Radio>
                          ))}
                          <Radio value={NEW_WINE}>{t('inventoryCount.report.newWine')}</Radio>
                        </RadioGroup>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-sm">
          {error}
        </div>
      )}

      {isCompleted ? (
        <div className="rounded-xl bg-success-50 border border-success-200 px-4 py-3 text-sm text-success-700">
          {t('inventoryCount.report.completedNotice')}
        </div>
      ) : (
        <div className="flex justify-end">
          <Button color="primary" size="md" isLoading={completeMutation.isPending} onPress={handleClose}>
            {corrections.length > 0
              ? t('inventoryCount.report.closeWithCorrections', { count: corrections.length })
              : t('inventoryCount.report.close')}
          </Button>
        </div>
      )}
    </div>
  );
}
