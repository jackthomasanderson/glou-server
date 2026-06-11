'use client';
import React from 'react';
import { Card, CardBody, CardFooter, Avatar, Chip, Button, Tooltip } from '@heroui/react';
import { Pencil, Trash2, Star, Wine } from 'lucide-react';
import { TastingNote } from '@/lib/tastings/types';
import { useTranslation } from 'react-i18next';

interface TastingCardProps {
  note: TastingNote;
  onEdit: (note: TastingNote) => void;
  onDelete: (note: TastingNote) => void;
}

export function TastingCard({ note, onEdit, onDelete }: TastingCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="transition-shadow hover:shadow-lg w-full" radius="lg">
      <CardBody className="pb-1">
        {/* Top row: avatar + name/date + rating */}
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar
              src={note.item?.photoUrl ?? undefined}
              fallback={<Wine size={16} />}
              className="w-9 h-9 shrink-0 bg-primary-100 text-primary"
              showFallback
            />
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">
                {note.item
                  ? `${note.item.name} — ${note.item.producer}`
                  : t('tastings.noItem')}
              </p>
              <p className="text-xs text-default-400">
                {new Date(note.tastedAt).toLocaleDateString()}
                {note.context ? ` · ${note.context}` : ''}
              </p>
            </div>
          </div>

          {/* Read-only star rating */}
          {note.rating != null && (
            <div className="flex items-center shrink-0">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={14}
                  className={note.rating! >= star ? 'text-warning' : 'text-default-200'}
                  fill={note.rating! >= star ? 'currentColor' : 'none'}
                />
              ))}
            </div>
          )}
        </div>

        {/* Notes (clamped to 3 lines) */}
        {note.notes && (
          <p
            className="text-sm text-default-500 mb-2 whitespace-pre-wrap"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            } as React.CSSProperties}
          >
            {note.notes}
          </p>
        )}

        {/* Readiness + food pairing chips */}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {note.readiness && (
            <Chip
              size="sm"
              variant="flat"
              color={
                note.readiness === 'PERFECT' ? 'success'
                : note.readiness === 'PEAK' ? 'warning'
                : note.readiness === 'PAST' ? 'danger'
                : 'default'
              }
            >
              {t(`tastings.readiness.${note.readiness}`)}
            </Chip>
          )}
          {note.foodPairing && (
            <Chip size="sm" variant="bordered">
              {note.foodPairing}
            </Chip>
          )}
        </div>
      </CardBody>

      <CardFooter className="pt-0 justify-end gap-1">
        <Tooltip content={t('actions.edit')}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label={t('actions.edit')}
            onPress={() => onEdit(note)}
          >
            <Pencil size={16} />
          </Button>
        </Tooltip>
        <Tooltip content={t('actions.delete')}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="danger"
            aria-label={t('actions.delete')}
            onPress={() => onDelete(note)}
          >
            <Trash2 size={16} />
          </Button>
        </Tooltip>
      </CardFooter>
    </Card>
  );
}
