'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Textarea } from '@heroui/react';
import { Star } from 'lucide-react';
import { LineDialogFrame } from '@/components/inventory/StockLineDialogParts';
import type { GuestTastingPayload } from '@/lib/shares/types';

interface GuestTastingDialogProps {
  /** The wine's name, under the title. */
  wine: string;
  isPending: boolean;
  onConfirm: (tasting: GuestTastingPayload) => void;
  onClose: () => void;
}

/**
 * "Noter une dégustation" for a guest (FEAT-109 c3, ux-ui.md §10.9): the
 * day, the stars, what was noticed and what it was served with. It goes on
 * the wine, signed with the guest's name (decision #471, point 64).
 */
export function GuestTastingDialog({ wine, isPending, onConfirm, onClose }: GuestTastingDialogProps) {
  const { t } = useTranslation();
  const [tastedAt, setTastedAt] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [foodPairing, setFoodPairing] = useState('');

  const submit = () => onConfirm({
    ...(tastedAt ? { tastedAt } : {}),
    rating,
    ...(notes.trim() ? { notes: notes.trim() } : {}),
    ...(foodPairing.trim() ? { foodPairing: foodPairing.trim() } : {}),
  });

  return (
    <LineDialogFrame
      isOpen
      onClose={onClose}
      title={t('shares.guest.tasting.title')}
      line={wine}
      confirmLabel={t('actions.save')}
      onConfirm={submit}
      canConfirm
      isPending={isPending}
      testId="guest-tasting-dialog"
    >
      <Input
        type="date"
        size="sm"
        variant="bordered"
        labelPlacement="outside"
        label={t('tastings.fields.tastedAt')}
        value={tastedAt}
        onValueChange={setTastedAt}
      />
      <div>
        <p className="text-xs text-foreground-500 mb-1">{t('tastings.fields.rating')}</p>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Button
              key={star}
              isIconOnly
              size="sm"
              variant="light"
              color={(rating ?? 0) >= star ? 'warning' : 'default'}
              radius="full"
              type="button"
              aria-pressed={rating === star}
              onPress={() => setRating((current) => (current === star ? null : star))}
              aria-label={`${t('tastings.fields.rating')} ${star}`}
            >
              <Star size={18} fill={(rating ?? 0) >= star ? 'currentColor' : 'none'} />
            </Button>
          ))}
        </div>
      </div>
      <Textarea
        size="sm"
        variant="bordered"
        labelPlacement="outside"
        label={t('tastings.fields.notes')}
        value={notes}
        onValueChange={setNotes}
        maxLength={5000}
        minRows={3}
      />
      <Input
        size="sm"
        variant="bordered"
        labelPlacement="outside"
        label={t('tastings.fields.foodPairing')}
        value={foodPairing}
        onValueChange={setFoodPairing}
        maxLength={500}
      />
    </LineDialogFrame>
  );
}
