'use client';
import React from 'react';
import { Avatar, Button, Chip, Drawer, DrawerContent } from '@heroui/react';
import { X, Pencil, Star, Wine } from 'lucide-react';
import { TastingNote } from '@/lib/tastings/types';
import { expertRows } from '@/lib/tastings/expertGrid';
import { useTranslation } from 'react-i18next';
import { isTastedElsewhere, tastedPhoto, tastedWineTitle } from '@/lib/tastings/onWine';
import { useHasMounted } from '@/hooks/useHasMounted';
import { formatDate } from '@/lib/format';
import { guestSignature } from '@/lib/shares/guestSignature';

interface TastingDetailDrawerProps {
  note: TastingNote | null;
  open: boolean;
  onClose: () => void;
  onEdit: (note: TastingNote) => void;
}

export function TastingDetailDrawer({ note, open, onClose, onEdit }: TastingDetailDrawerProps) {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();

  const visible = hasMounted && open && !!note;

  if (!visible) return null;

  const expert = expertRows(note);

  const readinessColor =
    note.readiness === 'PERFECT' ? 'success'
    : note.readiness === 'PEAK' ? 'warning'
    : note.readiness === 'PAST' ? 'danger'
    : 'default';

  return (
    <Drawer
      isOpen={visible}
      onClose={onClose}
      placement="right"
      backdrop="opaque"
      hideCloseButton
      classNames={{ base: 'max-w-[420px] shadow-xl' }}
    >
      <DrawerContent>
        <>
          {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-divider shrink-0">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-0.5">
            {t('tastings.title')}
          </p>
          <div className="flex justify-between items-start">
            <h2 id="tasting-detail-title" className="text-lg font-bold leading-tight pr-8">
              {tastedWineTitle(note) ?? t('tastings.noItem')}
            </h2>
            <button
              onClick={onClose}
              className="shrink-0 p-1 rounded-lg hover:bg-default-100 transition-colors"
              aria-label={t('actions.close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Avatar + rating + date */}
          <div className="flex items-center gap-4">
            <Avatar
              src={tastedPhoto(note)}
              fallback={<Wine size={24} />}
              className="w-14 h-14 bg-primary-100 text-primary shrink-0"
              showFallback
            />
            <div>
              {note.rating != null && (
                <div className="flex items-center gap-0.5 mb-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={18}
                      className={note.rating! >= star ? 'text-warning' : 'text-default-200'}
                      fill={note.rating! >= star ? 'currentColor' : 'none'}
                    />
                  ))}
                </div>
              )}
              <p className="text-sm text-foreground-500">
                {formatDate(note.tastedAt, i18n.language, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {note.context ? ` · ${note.context}` : ''}
                {isTastedElsewhere(note) ? ` · ${t('familyDrawer.tastings.elsewhere')}` : ''}
                {note.guestName != null ? ` · ${guestSignature(note.guestName, t)}` : ''}
              </p>
            </div>
          </div>

          {/* Chips */}
          {(note.readiness || note.foodPairing) && (
            <div className="flex flex-wrap gap-2">
              {note.readiness && (
                <Chip size="sm" variant="flat" color={readinessColor}>
                  {t(`tastings.readiness.${note.readiness}`)}
                </Chip>
              )}
              {note.foodPairing && (
                <Chip size="sm" variant="bordered">
                  {note.foodPairing}
                </Chip>
              )}
            </div>
          )}

          {/* Notes */}
          {note.notes && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
                {t('tastings.fields.notes')}
              </p>
              <p className="text-sm text-foreground-700 whitespace-pre-wrap leading-relaxed">
                {note.notes}
              </p>
            </div>
          )}

          {/* #642: the structured grid of expert mode, shown whatever the mode as soon as one field is filled. */}
          {expert.length > 0 && (
            <section aria-labelledby="tasting-expert-title">
              <p id="tasting-expert-title" className="text-xs font-bold uppercase tracking-widest text-foreground-500 mb-2">
                {t('tastings.expertSection.title')}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {expert.map(({ field, value }) => (
                  <React.Fragment key={field}>
                    <dt className="text-foreground-500">{t(`tastings.fields.${field}`)}</dt>
                    <dd className="text-foreground-700 whitespace-pre-wrap break-words">
                      {field === 'longueurBouche' ? t('tastings.expertSection.seconds', { value }) : value}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-divider shrink-0">
          <Button
            color="primary"
            variant="solid"
            fullWidth
            startContent={<Pencil size={14} />}
            onPress={() => {
              onClose();
              onEdit(note);
            }}
          >
            {t('actions.edit')}
          </Button>
        </div>
        </>
      </DrawerContent>
    </Drawer>
  );
}
