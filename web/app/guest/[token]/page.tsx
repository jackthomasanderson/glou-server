'use client';

import React, { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Input, Spinner, Switch, Textarea } from '@heroui/react';
import { Eye, EyeOff, Lock, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { guestClient } from '@/lib/shares/client';
import { GuestShareMeta } from '@/lib/shares/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GuestItem {
  id: string;
  name: string;
  producer: string;
  category: string;
  vintage?: number | null;
  color?: string | null;
  region?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  purchasePrice?: number | null;
  estimatedValue?: number | null;
  isOpened: boolean;
  fillLevel?: number | null;
  cellarId?: string | null;
  alertStatus?: string | null;
}

// ─── Item card ───────────────────────────────────────────────────────────────

function GuestItemCard({ item, token, editable }: { item: GuestItem; token: string; editable: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isOpened, setIsOpened] = useState(item.isOpened);
  const [fillLevel, setFillLevel] = useState(item.fillLevel != null ? String(item.fillLevel) : '');
  const [notes, setNotes] = useState(item.notes ?? '');

  const updateMutation = useMutation({
    mutationFn: () =>
      guestClient.updateItem(token, item.id, {
        isOpened,
        fillLevel: fillLevel.trim() === '' ? null : Number(fillLevel),
        notes: notes.trim() === '' ? null : notes,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['guest', token, 'inventory'] });
      setIsEditing(false);
    },
  });

  return (
    <div className="bg-content1 border border-divider rounded-2xl p-4 flex flex-col gap-2">
      {item.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.photoUrl}
          alt={item.name}
          className="w-full h-32 object-cover rounded-xl mb-1"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{item.name}</p>
          <p className="text-xs text-foreground-400 truncate">{item.producer}</p>
        </div>
        {item.vintage && (
          <span className="text-xs font-mono text-foreground-500 shrink-0">{item.vintage}</span>
        )}
      </div>
      {item.region && (
        <p className="text-xs text-foreground-400">{item.region}</p>
      )}
      {item.estimatedValue != null && (
        <p className="text-xs font-medium text-primary">{item.estimatedValue.toFixed(2)} €</p>
      )}
      {item.isOpened && (
        <Chip color="secondary" variant="bordered" size="sm" radius="full" className="w-fit">
          {t('shares.guest.edit.openedBadge')}
        </Chip>
      )}
      {!isEditing && item.notes && (
        <p className="text-xs text-foreground-500 italic line-clamp-2">{item.notes}</p>
      )}

      {editable && (
        <div className="pt-2 mt-1 border-t border-divider">
          {!isEditing ? (
            <Button
              size="sm"
              variant="light"
              color="primary"
              startContent={<Pencil size={13} />}
              onPress={() => setIsEditing(true)}
              fullWidth
            >
              {t('shares.guest.edit.action')}
            </Button>
          ) : (
            <div className="flex flex-col gap-3 mt-1">
              <Switch isSelected={isOpened} onValueChange={setIsOpened} size="sm">
                <span className="text-xs">{t('shares.guest.edit.opened')}</span>
              </Switch>
              <Input
                type="number"
                label={t('shares.guest.edit.fillLevel')}
                value={fillLevel}
                onValueChange={setFillLevel}
                min={0}
                max={100}
                size="sm"
                variant="bordered"
                radius="md"
                labelPlacement="outside"
              />
              <Textarea
                label={t('shares.guest.edit.notes')}
                value={notes}
                onValueChange={setNotes}
                size="sm"
                variant="bordered"
                radius="md"
                labelPlacement="outside"
                maxLength={2000}
              />
              {updateMutation.isError && (
                <p className="text-xs text-danger">{t('shares.guest.edit.error')}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => setIsEditing(false)}
                  isDisabled={updateMutation.isPending}
                >
                  {t('actions.cancel')}
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isLoading={updateMutation.isPending}
                  onPress={() => updateMutation.mutate()}
                >
                  {t('actions.save')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

function GuestPageContent({ token }: { token: string }) {
  const { t } = useTranslation();

  const metaQuery = useQuery<GuestShareMeta, Error>({
    queryKey: ['guest', token, 'meta'],
    queryFn: () => guestClient.getMeta(token),
    retry: false,
  });

  const inventoryQuery = useQuery<GuestItem[], Error>({
    queryKey: ['guest', token, 'inventory'],
    queryFn: () => guestClient.getInventory(token) as Promise<GuestItem[]>,
    enabled: metaQuery.isSuccess,
    retry: false,
  });

  if (metaQuery.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <Lock size={48} className="text-default-300 mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground-500">{t('shares.guest.expired')}</p>
        </div>
      </div>
    );
  }

  const meta = metaQuery.data;
  const items = inventoryQuery.data ?? [];

  const scopeLabel =
    !meta
      ? ''
      : meta.cellarIds.length > 0
        ? t('shares.cellarCount', { count: meta.cellarIds.length })
        : meta.collectionIds.length > 0
          ? t('shares.collectionCount', { count: meta.collectionIds.length })
          : t('shares.guest.scopeAll');

  return (
    <div className="min-h-screen bg-background">
      {/* Top banner */}
      <div className="sticky top-0 z-30 bg-content1 border-b border-divider px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eye size={16} className="text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">
            {meta?.label ?? t('shares.guest.badge')}
          </span>
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
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

        {/* Empty */}
        {inventoryQuery.isSuccess && items.length === 0 && (
          <div className="text-center py-16 text-foreground-400">
            <p>{t('shares.guest.empty')}</p>
          </div>
        )}

        {/* Grid */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((item) => (
              <GuestItemCard
                key={item.id}
                item={item}
                token={token}
                editable={!!meta?.writeCellarIds.includes(item.cellarId ?? '')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Route page — uses root layout providers (no auth, no main layout) ───────

export default function GuestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <GuestPageContent token={token} />;
}
