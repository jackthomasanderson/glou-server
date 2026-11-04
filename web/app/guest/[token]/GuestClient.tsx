'use client';

import React, { use, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Input, Select, SelectItem, Spinner } from '@heroui/react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBrowserTabTitle } from '@/hooks/useBrowserTabTitle';
import { guestClient, GuestRequestError } from '@/lib/shares/client';
import { guestFamilies } from '@/lib/shares/guestFamilies';
import { ErrorState } from '@/components/ui/ErrorState';
import { GuestFamilyCard, isLinkGone, refusalKey, type GuestTastingTarget } from '@/components/shares/GuestFamilyCard';
import { GuestTastingDialog } from '@/components/shares/GuestTastingDialog';
import { notifyError, notifySuccess } from '@/lib/toast';
import type { GuestItem, GuestShareMeta, GuestTastingPayload } from '@/lib/shares/types';

// ─── Main page ───────────────────────────────────────────────────────────────

const GUEST_PAGE_SIZE = 60;

export function GuestPageContent({ token }: { token: string }) {
  const { t } = useTranslation();
  useBrowserTabTitle(t('shares.guest.badge'));

  const metaQuery = useQuery<GuestShareMeta, Error>({
    queryKey: ['guest', token, 'meta'],
    queryFn: () => guestClient.getMeta(token),
    retry: false,
  });

  // Rendered by slices: a whole-cellar share can hold hundreds of cards.
  const [visibleCount, setVisibleCount] = useState(GUEST_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'producer' | 'vintage'>('name');

  const inventoryQuery = useQuery<GuestItem[], Error>({
    queryKey: ['guest', token, 'inventory'],
    queryFn: () => guestClient.getInventory(token) as Promise<GuestItem[]>,
    retry: false,
  });

  const families = useMemo(() => guestFamilies(inventoryQuery.data ?? []), [inventoryQuery.data]);

  // #471 (FEAT-109): a write refused because the link died meanwhile → the "expired" screen.
  const queryClient = useQueryClient();
  const linkGone = () => { void queryClient.invalidateQueries({ queryKey: ['guest', token, 'meta'] }); };

  // « Noter une dégustation »: held by the page, so it outlives the card of a
  // wine whose last bottle was just drunk (decision #471 point 70).
  const [tastingTarget, setTastingTarget] = useState<GuestTastingTarget | null>(null);
  const noteTasting = useMutation({
    mutationFn: (payload: GuestTastingPayload) => guestClient.createTasting(token, payload),
  });
  const saveTasting = async (target: GuestTastingTarget, payload: GuestTastingPayload) => {
    try {
      await noteTasting.mutateAsync({ productId: target.productId, ...(target.itemId ? { itemId: target.itemId } : {}), ...payload });
    } catch (error) {
      if (isLinkGone(error)) linkGone();
      notifyError(refusalKey(error));
      return;
    }
    notifySuccess('shares.guest.tasting.done');
    setTastingTarget(null);
  };

  // Only a server answer saying the link is unusable means "expired or revoked";
  // network drops, 5xx and rate limits are transient and deserve a retry.
  const linkIsInvalid = metaQuery.error instanceof GuestRequestError
    && [400, 403, 404, 410].includes(metaQuery.error.status);

  if (metaQuery.isError && !linkIsInvalid) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-sm w-full">
          <ErrorState
            message={t('shares.guest.loadError')}
            onRetry={() => { void metaQuery.refetch(); }}
            isRetrying={metaQuery.isFetching}
          />
        </div>
      </main>
    );
  }

  if (metaQuery.isError) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div role="alert" className="text-center max-w-sm">
          <Lock size={48} className="text-foreground-400 mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground-500">{t('shares.guest.expired')}</p>
        </div>
      </main>
    );
  }

  const meta = metaQuery.data;
  // #471 (FEAT-109, ux-ui.md §10.9): one card per wine, its bottles in the shared scope.
  const allItems = families;
  const needle = search.trim().toLowerCase();
  const items = allItems
    .filter((i) => !needle || [i.name, i.producer, i.region].some((v) => v?.toLowerCase().includes(needle)))
    .sort((a, b) => {
      if (sortKey === 'vintage') return (b.vintage ?? 0) - (a.vintage ?? 0);
      return (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '');
    });

  const scopeLabel =
    !meta
      ? ''
      : meta.cellarIds.length > 0
        ? t('shares.cellarCount', { count: meta.cellarIds.length })
        : meta.collectionIds.length > 0
          ? t('shares.collectionCount', { count: meta.collectionIds.length })
          : t('shares.guest.scopeAll');

  return (
    <main className="min-h-screen bg-background">
      {/* Top banner */}
      <div className="sticky top-0 z-30 bg-content1 border-b border-divider px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eye size={16} className="text-primary shrink-0" />
          <h1 className="text-sm font-semibold truncate">
            {meta?.label ?? t('shares.guest.badge')}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Chip color="primary" variant="flat" size="sm">
            {meta && meta.writeCellarIds.length > 0
              ? t('shares.guest.partialWrite')
              : t('shares.guest.readOnly')}
          </Chip>
          {meta?.hidePrices && (
            <Chip color="warning" variant="flat" size="sm" startContent={<EyeOff size={10} />}>
              {t('shares.guest.pricesHidden')}
            </Chip>
          )}
          {meta?.hideNotes && (
            <Chip color="warning" variant="flat" size="sm" startContent={<EyeOff size={10} />}>
              {t('shares.guest.notesHidden')}
            </Chip>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Scope subtitle */}
        {meta && (
          <p className="text-xs text-foreground-400 mb-4">{scopeLabel}</p>
        )}

        {/* Loading */}
        {(metaQuery.isLoading || inventoryQuery.isLoading) && (
          <div role="status" aria-live="polite" className="flex justify-center py-16">
            <Spinner size="lg" aria-label={t('status.loading')} />
          </div>
        )}

        {/* Search and sort */}
        {allItems.length > 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Input
              size="sm" variant="bordered" className="sm:col-span-2" isClearable
              label={t('shares.guest.search')}
              value={search}
              onValueChange={(v) => { setSearch(v); setVisibleCount(GUEST_PAGE_SIZE); }}
            />
            <Select
              size="sm" variant="bordered"
              label={t('shares.guest.sortBy')}
              selectedKeys={[sortKey]}
              disallowEmptySelection
              onSelectionChange={(keys) => setSortKey(String(Array.from(keys)[0]) as 'name' | 'producer' | 'vintage')}
            >
              <SelectItem key="name">{t('inventory.fields.name')}</SelectItem>
              <SelectItem key="producer">{t('inventory.fields.producer')}</SelectItem>
              <SelectItem key="vintage">{t('inventory.fields.vintage')}</SelectItem>
            </Select>
          </div>
        )}

        {/* Empty */}
        {inventoryQuery.isSuccess && items.length === 0 && (
          <div role="status" aria-live="polite" className="text-center py-16 text-foreground-400">
            <p>{t('shares.guest.empty')}</p>
          </div>
        )}

        {/* Grid */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {meta && items.slice(0, visibleCount).map((family) => (
              <GuestFamilyCard
                key={family.productId}
                family={family}
                token={token}
                meta={meta}
                onNoteTasting={setTastingTarget}
                onLinkGone={linkGone}
              />
            ))}
          </div>
        )}
        {items.length > visibleCount && (
          <div className="flex justify-center mt-6">
            <Button variant="bordered" onPress={() => setVisibleCount((c) => c + GUEST_PAGE_SIZE)}>
              {t('shares.guest.showMore', { count: items.length - visibleCount })}
            </Button>
          </div>
        )}
      </div>
      {tastingTarget && (
        <GuestTastingDialog
          wine={tastingTarget.wine}
          isPending={noteTasting.isPending}
          onClose={() => setTastingTarget(null)}
          onConfirm={(payload) => { void saveTasting(tastingTarget, payload); }}
        />
      )}
    </main>
  );
}

// ─── Route page — uses root layout providers (no auth, no main layout) ───────

export function GuestClient({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <GuestPageContent token={token} />;
}
