'use client';
import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardBody, Button, Checkbox, CircularProgress } from '@heroui/react';
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountSession, CorrectionAction, Correction } from '@/lib/inventory-count/types';
import { useSessionReport, useCompleteCountSession } from '@/hooks/useInventoryCount';

interface SessionReportViewProps {
  session: CountSession;
}

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

  const [consumedIds, setConsumedIds] = useState<Set<string>>(new Set());
  const [moveIds, setMoveIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const corrections: Correction[] = useMemo(
    () => [
      ...Array.from(consumedIds).map((itemId) => ({ itemId, action: 'mark_consumed' as CorrectionAction })),
      ...Array.from(moveIds).map((itemId) => ({ itemId, action: 'move_to_scope' as CorrectionAction })),
    ],
    [consumedIds, moveIds]
  );

  const handleClose = async () => {
    setError(null);
    try {
      await completeMutation.mutateAsync(corrections);
      setConsumedIds(new Set());
      setMoveIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('status.error'));
    }
  };

  if (isLoading || !report) {
    return (
      <div className="flex justify-center p-8">
        <CircularProgress aria-label={t('status.loading')} />
      </div>
    );
  }

  const isCompleted = session.status === 'completed';

  return (
    <div className="flex flex-col gap-5">
      {/* Counts */}
      <div className="grid grid-cols-3 gap-3">
        <Card radius="lg" shadow="sm">
          <CardBody className="items-center text-center gap-1 py-4">
            <p className="text-2xl font-bold text-success">{report.counts.confirmed}</p>
            <p className="text-xs text-foreground-500">{t('inventoryCount.report.confirmed')}</p>
          </CardBody>
        </Card>
        <Card radius="lg" shadow="sm">
          <CardBody className="items-center text-center gap-1 py-4">
            <p className="text-2xl font-bold text-warning">{report.counts.missing}</p>
            <p className="text-xs text-foreground-500">{t('inventoryCount.report.missing')}</p>
          </CardBody>
        </Card>
        <Card radius="lg" shadow="sm">
          <CardBody className="items-center text-center gap-1 py-4">
            <p className="text-2xl font-bold text-danger">{report.counts.unexpected}</p>
            <p className="text-xs text-foreground-500">{t('inventoryCount.report.unexpected')}</p>
          </CardBody>
        </Card>
      </div>

      {/* Three reconciliation columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              report.confirmed.map((item) => (
                <div key={item.id} className="text-sm">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-xs text-foreground-400 truncate">{item.producer}</p>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Missing — corrective action: mark_consumed */}
        <Card radius="lg" shadow="sm" className="border border-warning-200">
          <CardHeader className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning" />
            <span className="text-sm font-semibold">{t('inventoryCount.report.missing')}</span>
          </CardHeader>
          <CardBody className="gap-3 pt-0 max-h-80 overflow-y-auto">
            {report.missing.length === 0 ? (
              <p className="text-xs text-foreground-400">{t('inventoryCount.report.none')}</p>
            ) : (
              report.missing.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <Checkbox
                    size="sm"
                    isSelected={consumedIds.has(item.id)}
                    onValueChange={() => setConsumedIds((prev) => toggleId(prev, item.id))}
                    isDisabled={isCompleted}
                    aria-label={t('inventoryCount.report.markConsumed')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-foreground-400 truncate">{item.producer}</p>
                    <p className="text-[0.65rem] text-warning-600 mt-0.5">
                      {t('inventoryCount.report.markConsumed')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Unexpected — corrective action: move_to_scope */}
        <Card radius="lg" shadow="sm" className="border border-danger-200">
          <CardHeader className="flex items-center gap-2">
            <HelpCircle size={16} className="text-danger" />
            <span className="text-sm font-semibold">{t('inventoryCount.report.unexpected')}</span>
          </CardHeader>
          <CardBody className="gap-3 pt-0 max-h-80 overflow-y-auto">
            {report.unexpected.length === 0 ? (
              <p className="text-xs text-foreground-400">{t('inventoryCount.report.none')}</p>
            ) : (
              report.unexpected.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <Checkbox
                    size="sm"
                    isSelected={moveIds.has(item.id)}
                    onValueChange={() => setMoveIds((prev) => toggleId(prev, item.id))}
                    isDisabled={isCompleted || !session.cellarId}
                    aria-label={t('inventoryCount.report.moveToScope')}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-foreground-400 truncate">{item.producer}</p>
                    <p className="text-[0.65rem] text-danger-600 mt-0.5">
                      {session.cellarId
                        ? t('inventoryCount.report.moveToScope')
                        : t('inventoryCount.report.moveDisabledNoCellar')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-sm">
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
