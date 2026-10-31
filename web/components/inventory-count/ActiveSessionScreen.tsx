'use client';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Card, CardBody, Button, Input, Chip, Progress, CircularProgress,
} from '@heroui/react';
import { Pause, Search, CheckCircle2, Circle, AlertTriangle, PackagePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountSession, CountLine } from '@/lib/inventory-count/types';
import { useSessionReport, useScanItem, usePauseCountSession } from '@/hooks/useInventoryCount';
import { useInventory } from '@/hooks/useInventory';
import { useComboboxKeys, optionDomId } from '@/hooks/useComboboxKeys';
import { RecordFoundItemModal } from './RecordFoundItemModal';

const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 8;
/** Copies one answer may count (the API's bound on a group). */
const MAX_COPIES = 1000;

interface ActiveSessionScreenProps {
  session: CountSession;
  onOpenSummary: () => void;
}

export function ActiveSessionScreen({ session, onOpenSummary }: ActiveSessionScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: report, isLoading } = useSessionReport(session.id);
  const { data: allItems } = useInventory();
  const scanMutation = useScanItem(session.id);
  const pauseMutation = usePauseCountSession();

  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const [autoScannedFor, setAutoScannedFor] = useState<string | null>(null);
  const [isFoundModalOpen, setIsFoundModalOpen] = useState(false);

  // Opening an existing QR code (?scan=itemId — same URL pattern as
  // InventoryDashboard's QR flow, see QrCodeModal.tsx) while a session is
  // active confirms that item directly instead of just opening its detail.
  useEffect(() => {
    const scanParam = searchParams.get('scan');
    if (scanParam && scanParam !== autoScannedFor && session.status === 'active') {
      // Paired with the router.replace() below (an external navigation side
      // effect that must stay in an effect) — splitting this setState out
      // to render-time would desync it from the URL cleanup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoScannedFor(scanParam);
      scanMutation.mutate({ itemId: scanParam });
      const next = new URLSearchParams(searchParams.toString());
      next.delete('scan');
      router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session.status, autoScannedFor]);

  // Quick-find search spans the FULL shared inventory (not just this
  // session's theoretical list) — an "unexpected" find is by definition an
  // item the system doesn't expect in this scope, so restricting the search
  // to the theoretical list would make it impossible to report one.
  const alreadyRecordedIds = useMemo(() => {
    const ids = new Set<string>();
    (report?.confirmed ?? []).forEach((i) => ids.add(i.id));
    // Only entries backed by a real InventoryItem have something to exclude
    // here — an "ajouter au stock" find (itemId null) isn't a scannable
    // existing item, so there's nothing to hide from the search results.
    (report?.unexpected ?? []).forEach((i) => {
      if (i.itemId) ids.add(i.itemId);
    });
    return ids;
  }, [report]);

  const searchResults = useMemo(() => {
    if (query.trim().length < MIN_SEARCH_LENGTH || !allItems) return [];
    const q = query.trim().toLowerCase();
    return allItems
      .filter((i) => !alreadyRecordedIds.has(i.id))
      .filter((i) => i.name.toLowerCase().includes(q) || i.producer.toLowerCase().includes(q))
      .slice(0, MAX_SEARCH_RESULTS);
  }, [query, allItems, alreadyRecordedIds]);

  const handleSelectResult = (itemId: string) => {
    scanMutation.mutate({ itemId });
    setQuery('');
    setIsSearchOpen(false);
  };

  const searchListId = useId();
  const searchKeys = useComboboxKeys(searchResults, {
    isOpen: isSearchOpen,
    open: () => setIsSearchOpen(true),
    dismiss: () => setIsSearchOpen(false),
    pick: (item) => handleSelectResult(item.id),
  });
  const searchExpanded = isSearchOpen && searchResults.length > 0;

  const progressPercent =
    report && report.counts.expected > 0
      ? Math.round((report.counts.confirmed / report.counts.expected) * 100)
      : 0;

  // #471 (FEAT-100): one line per group of the theoretical list, plus what
  // was confirmed outside it (a free-label scope has no theoretical list).
  const checklist = useMemo(() => {
    const expected = report?.expected ?? [];
    const listed = new Set(expected.map((line) => line.id));
    const extra = (report?.confirmed ?? []).filter((line) => !listed.has(line.id));
    return [...expected, ...extra].sort((a, b) => a.name.localeCompare(b.name));
  }, [report]);

  const isActive = session.status === 'active';

  return (
    <div className="flex flex-col gap-5">
      {!isActive && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          {t('inventoryCount.session.pausedNotice')}
        </div>
      )}

      <Card radius="lg" shadow="sm">
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs text-foreground-500 uppercase tracking-wide font-semibold">
                {t('inventoryCount.session.scopeLabel')}
              </p>
              <p className="text-lg font-bold">{session.scopeLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="bordered"
                color="primary"
                size="sm"
                startContent={<Pause size={14} />}
                onPress={() => pauseMutation.mutate(session.id)}
                isDisabled={!isActive}
                isLoading={pauseMutation.isPending}
              >
                {t('inventoryCount.session.pause')}
              </Button>
              <Button variant="light" color="primary" size="sm" onPress={onOpenSummary}>
                {t('inventoryCount.session.viewSummary')}
              </Button>
            </div>
          </div>

          {report && report.counts.expected > 0 ? (
            <div className="flex items-center gap-3">
              <Progress
                value={progressPercent}
                color="primary"
                size="sm"
                radius="full"
                className="flex-1"
                aria-label={t('inventoryCount.session.progressAria')}
              />
              <span className="text-sm font-semibold text-foreground-500 whitespace-nowrap">
                {t('inventoryCount.session.progressCount', {
                  confirmed: report.counts.confirmed,
                  expected: report.counts.expected,
                })}
              </span>
            </div>
          ) : (
            report && <p className="text-sm text-foreground-400">{t('inventoryCount.session.noTheoreticalList')}</p>
          )}

          {report && report.counts.unexpected > 0 && (
            <div className="flex items-center gap-2 text-danger text-sm">
              <AlertTriangle size={14} />
              <span>{t('inventoryCount.session.unexpectedFound', { count: report.counts.unexpected })}</span>
              <Button size="sm" variant="light" color="danger" onPress={onOpenSummary}>
                {t('inventoryCount.session.viewSummary')}
              </Button>
            </div>
          )}

          <div ref={searchWrapperRef} className="relative">
            <Input
              label={t('inventoryCount.session.searchLabel')}
              placeholder={t('inventoryCount.session.searchPlaceholder')}
              variant="bordered"
              labelPlacement="outside"
              size="md"
              isClearable
              startContent={<Search size={16} className="text-foreground-500" />}
              value={query}
              role="combobox"
              aria-expanded={searchExpanded}
              aria-controls={searchListId}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-activedescendant={
                searchExpanded && searchKeys.activeIndex >= 0 ? optionDomId(searchListId, searchKeys.activeIndex) : undefined
              }
              onValueChange={(v) => {
                setQuery(v);
                setIsSearchOpen(true);
                searchKeys.resetActive();
              }}
              onFocus={() => {
                if (query.trim()) setIsSearchOpen(true);
              }}
              // Rows never take focus (aria-activedescendant): a blur means the user left.
              onBlur={() => { setIsSearchOpen(false); searchKeys.resetActive(); }}
              onKeyDown={searchKeys.onKeyDown}
              isDisabled={!isActive}
            />
            {searchExpanded && (
              <div
                className="absolute z-[1500] left-0 top-full mt-1 w-full bg-background border border-default-200 rounded-xl shadow-xl overflow-hidden"
              >
                <ul id={searchListId} role="listbox" aria-label={t('inventoryCount.session.searchLabel')} className="py-1 max-h-64 overflow-y-auto">
                  {searchResults.map((item, idx) => (
                    <li
                      key={item.id}
                      id={optionDomId(searchListId, idx)}
                      role="option"
                      aria-selected={idx === searchKeys.activeIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectResult(item.id)}
                      onMouseEnter={() => searchKeys.setActiveIndex(idx)}
                      className={`flex flex-col px-3 py-2 cursor-pointer ${idx === searchKeys.activeIndex ? 'bg-default-100' : 'hover:bg-default-100'}`}
                    >
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs text-foreground-400">{item.producer}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <Button
            variant="light"
            color="default"
            size="sm"
            startContent={<PackagePlus size={14} />}
            onPress={() => setIsFoundModalOpen(true)}
            isDisabled={!isActive}
            className="self-start"
          >
            {t('inventoryCount.session.foundNew.trigger')}
          </Button>
        </CardBody>
      </Card>

      <RecordFoundItemModal
        sessionId={session.id}
        isOpen={isFoundModalOpen}
        onClose={() => setIsFoundModalOpen(false)}
      />

      <Card radius="lg" shadow="sm">
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8" role="status" aria-live="polite">
              <CircularProgress aria-label={t('status.loading')} />
            </div>
          ) : checklist.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-foreground-400">
              {t('inventoryCount.session.emptyList')}
            </p>
          ) : (
            <ul className="divide-y divide-divider">
              {checklist.map((line) => (
                <CountRow
                  key={line.id}
                  line={line}
                  isActive={isActive}
                  isPending={scanMutation.isPending && scanMutation.variables?.itemId === line.id}
                  onConfirm={(foundQuantity) => scanMutation.mutate({ itemId: line.id, foundQuantity })}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

interface CountRowProps {
  line: CountLine;
  isActive: boolean;
  isPending: boolean;
  onConfirm: (foundQuantity?: number) => void;
}

/**
 * #471 (FEAT-100, ux-ui §10.11): a group is counted in one answer — "Combien
 * en avez-vous trouvé ?", prefilled with the number expected — and a single
 * bottle (or an opened one) is confirmed in one tap, as before.
 */
function CountRow({ line, isActive, isPending, onConfirm }: CountRowProps) {
  const { t } = useTranslation();
  const isGroup = line.isGroup && line.expectedQuantity > 1;
  const [answer, setAnswer] = useState(String(line.foundQuantity ?? line.expectedQuantity));
  const found = line.foundQuantity;
  const parsed = Number(answer);
  const isValid = answer.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_COPIES;

  const status = found == null
    ? <Chip size="sm" variant="flat" color="default">{t('inventoryCount.status.pending')}</Chip>
    : found >= line.expectedQuantity
      ? <Chip size="sm" variant="flat" color="success">{isGroup ? t('inventoryCount.status.foundOf', { found, expected: line.expectedQuantity }) : t('inventoryCount.status.confirmed')}</Chip>
      : <Chip size="sm" variant="flat" color="warning">{t('inventoryCount.status.foundOf', { found, expected: line.expectedQuantity })}</Chip>;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {found != null && found >= line.expectedQuantity ? (
        <CheckCircle2 size={18} className="text-success shrink-0" />
      ) : (
        <Circle size={18} className="text-foreground-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {line.name}
          {isGroup && <span className="ml-2 text-foreground-500 font-semibold">{t('inventoryCount.session.times', { number: line.expectedQuantity })}</span>}
        </p>
        <p className="text-xs text-foreground-400 truncate">{line.producer}</p>
      </div>
      {status}
      {isGroup ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (isValid) onConfirm(parsed);
          }}
        >
          <span className="text-xs text-foreground-500 self-center" aria-hidden="true">
            {t('inventoryCount.session.howMany')}
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_COPIES}
            size="sm"
            variant="bordered"
            className="w-20"
            // The visible question is the same on every line: the name tells them apart.
            aria-label={t('inventoryCount.session.howManyAria', { name: line.name })}
            value={answer}
            onValueChange={setAnswer}
            isInvalid={!isValid}
            isDisabled={!isActive}
          />
          <Button type="submit" size="sm" variant="flat" color="primary" isDisabled={!isActive || !isValid} isLoading={isPending}>
            {t('inventoryCount.session.saveCount')}
          </Button>
        </form>
      ) : (
        found == null && (
          <Button size="sm" variant="light" color="primary" isDisabled={!isActive} isLoading={isPending} onPress={() => onConfirm()}>
            {t('inventoryCount.session.confirmTap')}
          </Button>
        )
      )}
    </li>
  );
}
