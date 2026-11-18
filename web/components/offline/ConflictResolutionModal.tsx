'use client';
import React from 'react';
import { ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Chip } from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useCellars } from '@/hooks/useCellars';
import { formatHistoryValue, historyFieldLabel } from '@/lib/inventory/history-format';
import { conflictingFields } from '@/lib/offline/conflictFields';
import { actionOf, unitInStock, type UnitLike } from '@/lib/offline/optimistic';
import { changeLabel, mayAlreadyBeRecorded } from '@/lib/offline/describe';
import { adoptConflictServerUnit, fetchServerUnit } from '@/lib/offline/syncEngine';
import { notifyError, notifySuccess } from '@/lib/toast';
import { qk } from '@/lib/queryKeys';

// ─── FEAT-16/23 — offline sync conflict resolution ─────────────────────────
// Surfaces whenever a queued offline mutation comes back from the server
// with a 409 (its `expectedUpdatedAt` no longer matches — someone else
// modified the item in the meantime, see
// api/src/services/inventory.service.ts::updateItem). One conflict is shown
// at a time; resolving it reveals the next one, if any (rare in the shared
// single-inventory model, but possible with concurrent editors).

export function ConflictResolutionModal() {
  const { t, i18n } = useTranslation();
  const {
    conflictMutations, deferredConflictIds, deferConflict, resolveKeepLocal, resolveKeepServer,
  } = useOfflineSync();
  const { data: cellars } = useCellars();
  const [isResolving, setIsResolving] = React.useState(false);

  // "Decide later" hides a conflict for the browser session (kept by the sync
  // engine, not here: this dialog is mounted again by every page, #585); it
  // stays queued and flagged by the connectivity indicator.
  const pending = conflictMutations.filter((m) => !deferredConflictIds.includes(m.id));
  const current = pending[0];
  const isOpen = Boolean(current);
  // #1038: the line read again from the server each time a conflict is
  // shown — the version kept with the conflict can be old (left for later,
  // finished meanwhile). Review of #1054 (B1): that version becomes the one
  // « Garder ma version » applies against, so what is shown is what is
  // checked; the actions wait for it. Second review of #1054 (C1): run
  // offline too (`networkMode`), where React Query would otherwise pause the
  // read for the whole offline period and leave this dialog — which cannot
  // be dismissed — with both choices greyed out. `fetchServerUnit` answers
  // null without the network, and the line kept with the conflict is shown.
  const { data: fresh, isPending: isReading, refetch } = useQuery({
    queryKey: qk.offlineConflictUnit(current?.id ?? ''),
    queryFn: () => fetchServerUnit(current?.itemId ?? ''),
    enabled: Boolean(current),
    networkMode: 'always',
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const currentId = current?.id;
  React.useEffect(() => {
    if (currentId && fresh?.unit) void adoptConflictServerUnit(currentId, fresh.unit);
  }, [currentId, fresh]);
  // Review of #1054: which choice is put first is decided once the line has
  // been read, then kept for this conflict — never swapped under a finger.
  const [firstChoice, setFirstChoice] = React.useState<{ id: string; maybeRecorded: boolean } | null>(null);
  // Decided again the next time a conflict is shown (the dialog is never unmounted).
  if (!isOpen && firstChoice) setFirstChoice(null);

  if (!current) return null;

  const lineGone = fresh?.unit === null;
  const serverItem = (fresh?.unit ?? current.conflictServerItem) as Record<string, unknown> | undefined;
  // #585: only the fields that really differ, technical ones left out.
  const rows = conflictingFields(current.patch, serverItem);
  // FEAT-108: an action on a line (open, drink, smoke one; correct its
  // number) is said as such, with the line's number then and now — not as
  // fields ("Ouvert : oui / non") that would hide what changed elsewhere.
  const action = actionOf(current);
  const label = changeLabel(current, t);
  const numberThen = current.before?.quantity;
  // A line finished, written off or emptied on the server has no bottle
  // left: "plus en stock", never its last number (#1038: "×1 maintenant").
  const inStockNow = serverItem ? unitInStock(serverItem as UnitLike) : false;
  const numberNow = serverItem?.quantity;
  // Review of #823 (N1): the line moved exactly as the action would have
  // moved it — the connection may have dropped while it was being sent, so
  // it may already be recorded. Keeping the server's version comes first.
  // Adjusted during render, React's documented pattern.
  if (!isReading && firstChoice?.id !== current.id) {
    setFirstChoice({ id: current.id, maybeRecorded: mayAlreadyBeRecorded(current, serverItem) });
  }
  const maybeRecorded = firstChoice?.id === current.id
    ? firstChoice.maybeRecorded
    : mayAlreadyBeRecorded(current, serverItem);
  // Nothing left to apply the action to: only the server's version makes sense.
  const serverFirst = maybeRecorded || lineGone;
  const valueContext = {
    lang: i18n.language,
    cellarName: (id: string) => cellars?.find((c) => c.id === id)?.name,
  };

  // #1038: what was kept, said once the dialog closes.
  const name = typeof serverItem?.name === 'string' ? serverItem.name : undefined;
  const kept = [label, name].filter(Boolean).join(' — ');

  const handleKeepLocal = async () => {
    setIsResolving(true);
    try {
      const outcome = await resolveKeepLocal(current.id);
      if (outcome === 'sent') notifySuccess('offline.conflict.keptLocal.sent', { what: kept });
      else if (outcome === 'pending' || outcome === 'syncing') {
        // Offline: at the connection's return; online (the server asked to
        // wait, or another replay holds it): in a moment.
        notifySuccess(navigator.onLine === false ? 'offline.conflict.keptLocal.pending' : 'offline.conflict.keptLocal.soon', { what: kept });
      } else if (outcome === 'failed') notifyError('offline.conflict.keptLocal.failed', { what: kept });
      else if (outcome === 'conflict') {
        // Changed once more meanwhile: said, and the line read again.
        notifyError('offline.conflict.keptLocal.changedAgain', { what: kept });
        void refetch();
      }
    } finally {
      setIsResolving(false);
    }
  };

  const handleKeepServer = async () => {
    setIsResolving(true);
    try {
      await resolveKeepServer(current.id);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      isDismissable={false}
      isKeyboardDismissDisabled
      hideCloseButton
      size="lg"
      radius="lg"
      backdrop="opaque"
      placement="center"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-warning" />
          {t('offline.conflict.title')}
        </ModalHeader>
        <ModalBody>
          {name && <p className="text-sm font-semibold">{name}</p>}
          <p className="text-sm text-foreground-500">{t('offline.conflict.description')}</p>

          {pending.length > 1 && (
            <Chip size="sm" color="warning" variant="flat" radius="full">
              {t('offline.conflict.remaining', { count: pending.length - 1 })}
            </Chip>
          )}

          {action !== 'edit' ? (
            <div className="mt-2 border border-divider rounded-lg px-3 py-2 text-sm flex flex-col gap-1" data-testid="conflict-action">
              <p>
                <span className="text-foreground-500">{t('offline.conflict.yourAction')} </span>
                <span className="font-medium text-primary">{label}</span>
              </p>
              {!lineGone && numberThen != null && numberNow != null && (
                <p>
                  <span className="text-foreground-500">{t('offline.conflict.line')} </span>
                  <span className="font-medium text-warning-600">
                    {inStockNow
                      ? t('offline.conflict.lineThenNow', { then: numberThen, now: numberNow })
                      : t('offline.conflict.lineThenNoneLeft', { then: numberThen })}
                  </span>
                </p>
              )}
              {lineGone && (
                <p className="font-medium text-warning-700" data-testid="conflict-line-gone">{t('offline.conflict.lineGone')}</p>
              )}
              {maybeRecorded && (
                <p className="text-sm text-warning-700" data-testid="conflict-maybe-recorded">{t('offline.conflict.maybeRecorded')}</p>
              )}
              <p className="text-xs text-foreground-500">{t('offline.conflict.actionHint')}</p>
            </div>
          ) : lineGone ? (
            <p className="mt-2 text-sm font-medium text-warning-700" data-testid="conflict-line-gone">{t('offline.conflict.lineGone')}</p>
          ) : (
          <div className="mt-2 border border-divider rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-content2 text-xs font-semibold text-foreground-500">
              <span>{t('offline.conflict.field')}</span>
              <span>{t('offline.conflict.yourVersion')}</span>
              <span>{t('offline.conflict.serverVersion')}</span>
            </div>
            {rows.map(({ path, field, local, server }) => (
              <div key={path} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm border-t border-divider">
                <span className="text-foreground-500">{historyFieldLabel(field, t)}</span>
                <span className="font-medium text-primary">{formatHistoryValue(field, local, t, valueContext)}</span>
                <span className="font-medium text-warning-600">{formatHistoryValue(field, server, t, valueContext)}</span>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="px-3 py-2 text-sm text-foreground-500 border-t border-divider">
                {t('offline.conflict.noDifference')}
              </p>
            )}
          </div>
          )}
        </ModalBody>
        {/* #1038: stacked on a phone, each label whole (it overlapped at 390 px). */}
        <ModalFooter className="flex-col gap-2 sm:flex-row">
          <Button
            className="w-full sm:w-auto"
            variant="light"
            color="default"
            onPress={() => deferConflict(current.id)}
            isDisabled={isResolving}
          >
            {t('offline.conflict.decideLater')}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant={serverFirst ? 'solid' : 'light'}
            color={serverFirst ? 'primary' : 'default'}
            data-primary={serverFirst}
            onPress={handleKeepServer}
            isLoading={isResolving}
            isDisabled={isResolving || isReading}
          >
            {t('offline.conflict.keepServer')}
          </Button>
          {!lineGone && (
            <Button
              className="w-full sm:w-auto"
              color={serverFirst ? 'default' : 'primary'}
              variant={serverFirst ? 'light' : 'solid'}
              data-primary={!serverFirst}
              onPress={handleKeepLocal}
              isLoading={isResolving}
              isDisabled={isResolving || isReading}
            >
              {t('offline.conflict.keepLocal')}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </ResponsiveModal>
  );
}
