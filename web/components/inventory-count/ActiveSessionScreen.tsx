'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Card, CardBody, Button, Input, Chip, Progress, CircularProgress,
} from '@heroui/react';
import { Pause, Search, CheckCircle2, Circle, AlertTriangle, PackagePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountSession, CountReportItem } from '@/lib/inventory-count/types';
import { useSessionReport, useScanItem, usePauseCountSession } from '@/hooks/useInventoryCount';
import { useInventory } from '@/hooks/useInventory';
import { RecordFoundItemModal } from './RecordFoundItemModal';

const MIN_SEARCH_LENGTH = 2;
const MAX_SEARCH_RESULTS = 8;

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
      scanMutation.mutate(scanParam);
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
    scanMutation.mutate(itemId);
    setQuery('');
    setIsSearchOpen(false);
  };

  const progressPercent =
    report && report.counts.expected > 0
      ? Math.round((report.counts.confirmed / report.counts.expected) * 100)
      : 0;

  const checklist = useMemo(() => {
    const confirmed = (report?.confirmed ?? []).map((item) => ({ item, confirmed: true }));
    const pending = (report?.missing ?? []).map((item) => ({ item, confirmed: false }));
    return [...confirmed, ...pending].sort((a, b) => a.item.name.localeCompare(b.item.name));
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
              startContent={<Search size={16} className="text-default-400" />}
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setIsSearchOpen(true);
              }}
              onFocus={() => {
                if (query.trim()) setIsSearchOpen(true);
              }}
              onBlur={() => setTimeout(() => setIsSearchOpen(false), 150)}
              isDisabled={!isActive}
            />
            {isSearchOpen && searchResults.length > 0 && (
              <div
                className="absolute z-[1500] left-0 top-full mt-1 w-full bg-background border border-default-200 rounded-xl shadow-xl overflow-hidden"
              >
                <ul className="py-1 max-h-64 overflow-y-auto">
                  {searchResults.map((item) => (
                    <li
                      key={item.id}
                      onMouseDown={() => handleSelectResult(item.id)}
                      className="flex flex-col px-3 py-2 cursor-pointer hover:bg-default-100"
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
            <div className="flex justify-center p-8">
              <CircularProgress aria-label={t('status.loading')} />
            </div>
          ) : checklist.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-foreground-400">
              {t('inventoryCount.session.emptyList')}
            </p>
          ) : (
            <ul className="divide-y divide-divider">
              {checklist.map(({ item, confirmed }: { item: CountReportItem; confirmed: boolean }) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  {confirmed ? (
                    <CheckCircle2 size={18} className="text-success shrink-0" />
                  ) : (
                    <Circle size={18} className="text-default-300 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-foreground-400 truncate">{item.producer}</p>
                  </div>
                  <Chip size="sm" variant="flat" color={confirmed ? 'success' : 'default'}>
                    {confirmed ? t('inventoryCount.status.confirmed') : t('inventoryCount.status.pending')}
                  </Chip>
                  {!confirmed && (
                    <Button
                      size="sm"
                      variant="light"
                      color="primary"
                      isDisabled={!isActive}
                      isLoading={scanMutation.isPending && scanMutation.variables === item.id}
                      onPress={() => scanMutation.mutate(item.id)}
                    >
                      {t('inventoryCount.session.confirmTap')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
