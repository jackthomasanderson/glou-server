'use client';
import React, { useEffect } from 'react';
import { Avatar, Button, Chip } from '@heroui/react';
import { X, Pencil, Star, Wine } from 'lucide-react';
import { TastingNote } from '@/lib/tastings/types';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';

interface TastingDetailDrawerProps {
  note: TastingNote | null;
  open: boolean;
  onClose: () => void;
  onEdit: (note: TastingNote) => void;
}

export function TastingDetailDrawer({ note, open, onClose, onEdit }: TastingDetailDrawerProps) {
  const { t } = useTranslation();
  const hasMounted = useHasMounted();

  // Hand-rolled drawer (not the shared HeroUI Modal) — Escape-to-close isn't
  // automatic here, added explicitly. Hook must run before the early return
  // below (rules of hooks), so the "only when open" guard lives inside it.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!hasMounted || !open || !note) return null;

  const readinessColor =
    note.readiness === 'PERFECT' ? 'success'
    : note.readiness === 'PEAK' ? 'warning'
    : note.readiness === 'PAST' ? 'danger'
    : 'default';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="relative w-full sm:w-[420px] h-full bg-content1 flex flex-col overflow-hidden shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tasting-detail-title"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-divider shrink-0">
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-secondary mb-0.5">
            {t('tastings.title')}
          </p>
          <div className="flex justify-between items-start">
            <h2 id="tasting-detail-title" className="text-lg font-bold leading-tight pr-8">
              {note.item
                ? `${note.item.name} — ${note.item.producer}`
                : t('tastings.noItem')}
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
              src={note.item?.photoUrl ?? undefined}
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
              <p className="text-sm text-default-500">
                {new Date(note.tastedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                {note.context ? ` · ${note.context}` : ''}
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
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
                {t('tastings.fields.notes')}
              </p>
              <p className="text-sm text-default-700 whitespace-pre-wrap leading-relaxed">
                {note.notes}
              </p>
            </div>
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
      </div>
    </div>
  );
}
