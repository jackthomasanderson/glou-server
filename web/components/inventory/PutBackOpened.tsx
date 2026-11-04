'use client';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { TASTINGS_ON_ITEM } from '@shared/product';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useUpdateInventoryItem } from '@/hooks/useInventory';
import { productDetailKey } from '@/hooks/useProducts';
import { notifyUndoable } from '@/lib/toast';
import { bottleLabel, hasOwnLevel, type LineContext } from '@/lib/products/lines';
import { putBackPatch } from '@/lib/products/openDrink';
import type { InventoryItem } from '@/lib/inventory/types';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';

/**
 * "Annuler l'ouverture" and "Pleine" on an opened bottle (ux-ui.md §10.4.6,
 * FEAT-106): the bottle put back closed and full, which the API puts back
 * into its line of origin (×5 → ×6), or a line of one when that line is
 * gone or changed. A tasting noted on it is never dropped unasked: the API
 * refuses (409 TASTINGS_ON_ITEM) and the member is asked "La garder ?";
 * "Annuler" leaves the bottle opened. Done: "Bouteille remise avec les
 * autres (Garage · 20 €) · Annuler" — which opens it again at its level.
 *
 * `putBack` resolves true once written, false when refused or cancelled.
 */
export function usePutBackOpened(ctx: LineContext) {
  const queryClient = useQueryClient();
  const update = useUpdateInventoryItem();
  const { mutateAsync } = update;
  const [asking, setAsking] = useState<ProductItem | null>(null);
  const answer = useRef<((keep: boolean | null) => void) | null>(null);

  const latest = useCallback((item: Pick<ProductItem, 'id' | 'productId'>): ProductItem | undefined =>
    queryClient.getQueryData<ProductDetailView>(productDetailKey(item.productId))?.items.find((unit) => unit.id === item.id),
  [queryClient]);

  const settle = useCallback((productId: string) => {
    void queryClient.invalidateQueries({ queryKey: productDetailKey(productId) });
  }, [queryClient]);

  /** "Annuler": opens the bottle again (from the line it went back to), then sets its level on that one bottle. */
  const reopen = useCallback(async (written: InventoryItem, before: ProductItem) => {
    try {
      const opened = await mutateAsync({
        id: written.id,
        patch: { isOpened: true, fillLevel: 100, openedAt: before.openedAt ?? undefined },
        expectedUpdatedAt: (latest({ id: written.id, productId: before.productId })?.updatedAt as string | undefined) ?? written.updatedAt,
      });
      // The level on the bottle opened only — never on a line of several (second review of K).
      const level = before.fillLevel ?? 100;
      const one = { isOpened: opened.isOpened, fillLevel: opened.fillLevel ?? null, cigarsLeft: opened.cigarsLeft ?? null, quantity: opened.quantity ?? null };
      if (level < 100 && hasOwnLevel(one)) {
        await mutateAsync({ id: opened.id, patch: { fillLevel: level }, expectedUpdatedAt: opened.updatedAt });
      }
    } catch {
      // Refused (changed meanwhile): told by the mutation.
    } finally {
      settle(before.productId);
    }
  }, [latest, mutateAsync, settle]);

  const putBack = useCallback(async (item: ProductItem): Promise<boolean> => {
    const before = latest(item) ?? item;
    // Never on a line of several: written on a group, a state detaches one more bottle.
    if (!hasOwnLevel(before)) return false;
    const send = (keepTastings?: boolean) => mutateAsync({
      id: item.id,
      patch: { ...putBackPatch(), ...(keepTastings === undefined ? {} : { keepTastings }) },
      expectedUpdatedAt: before.updatedAt as string,
      quiet: [TASTINGS_ON_ITEM],
    });
    let written: InventoryItem;
    try {
      written = await send();
    } catch (error) {
      if (!(error instanceof Error && error.message === TASTINGS_ON_ITEM)) {
        settle(item.productId);
        return false;
      }
      // "Une dégustation a été notée sur cette bouteille. La garder ?"
      const keep = await new Promise<boolean | null>((resolve) => {
        answer.current = resolve;
        setAsking(before);
      });
      setAsking(null);
      answer.current = null;
      if (keep === null) return false;
      try {
        written = await send(keep);
      } catch {
        settle(item.productId);
        return false;
      }
    }
    settle(item.productId);
    // Without network the write waits in the offline queue: nothing to take back yet.
    if (written.id === item.id && written.updatedAt === before.updatedAt) return true;
    const rejoined = written.id !== item.id;
    notifyUndoable(
      rejoined ? 'openedReminder.putBack.rejoined' : 'openedReminder.putBack.alone',
      // "Garage · 20 € / bouteille": the line it went back to.
      rejoined ? { line: bottleLabel({ ...before, ...written } as unknown as ProductItem, ctx) } : undefined,
      () => { void reopen(written, before); },
    );
    return true;
  }, [ctx, latest, mutateAsync, reopen, settle]);

  const dialog = asking ? (
    <KeepTastingDialog
      line={bottleLabel(asking, ctx)}
      onAnswer={(keep) => answer.current?.(keep)}
    />
  ) : null;

  return { putBack, dialog, isPending: update.isPending };
}

/**
 * "Une dégustation a été notée sur cette bouteille. La garder ?" (§10.4.6):
 * "Garder la dégustation" (main, it stays on the wine) / "Ne pas la garder";
 * "Annuler" leaves the bottle opened.
 */
function KeepTastingDialog({ line, onAnswer }: { line: string; onAnswer: (keep: boolean | null) => void }) {
  const { t } = useTranslation();
  return (
    <ResponsiveModal isOpen onClose={() => onAnswer(null)} size="sm" radius="lg" backdrop="opaque" placement="center">
      <ModalContent>
        {() => (
          <div data-testid="keep-tasting-dialog">
            <ModalHeader className="flex flex-col gap-0.5 pb-1">
              <span>{t('openedReminder.keepTasting.title')}</span>
              <span className="text-xs font-normal text-foreground-500">{line}</span>
            </ModalHeader>
            <ModalBody className="py-2">
              <p className="text-sm">{t('openedReminder.keepTasting.question')}</p>
            </ModalBody>
            <ModalFooter className="flex flex-wrap gap-2 px-4 pb-4 pt-2">
              <Button variant="light" onPress={() => onAnswer(null)} className="flex-1">{t('actions.cancel')}</Button>
              <Button variant="bordered" onPress={() => onAnswer(false)} className="flex-1" data-testid="keep-tasting-no">
                {t('openedReminder.keepTasting.drop')}
              </Button>
              <Button color="primary" onPress={() => onAnswer(true)} className="flex-1" data-testid="keep-tasting-yes" autoFocus>
                {t('openedReminder.keepTasting.keep')}
              </Button>
            </ModalFooter>
          </div>
        )}
      </ModalContent>
    </ResponsiveModal>
  );
}
