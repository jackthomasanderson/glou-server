'use client';
import React from 'react';
import { Card, CardBody, CardFooter, Chip, Button, Tooltip } from '@heroui/react';
import { ACCESSIBLE_POPOVER } from '@/components/ui/accessiblePopover';
import { Pencil, Trash2 } from 'lucide-react';
import { Collection } from '@/lib/collections/types';
import { useTranslation } from 'react-i18next';

interface CollectionCardProps {
  collection: Collection;
  onEdit: (collection: Collection) => void;
  onDelete: (collection: Collection) => void;
  onClick: (collection: Collection) => void;
}

export function CollectionCard({ collection, onEdit, onDelete, onClick }: CollectionCardProps) {
  const { t } = useTranslation();
  const count = collection.items.length;

  return (
    // #656: not one big button containing Edit and Delete (invalid HTML, they
    // could not be reached with a screen reader). The name is the "open"
    // button, stretched over the card by an ::after overlay; the actions sit
    // above it.
    <Card
      className="relative transition-shadow hover:shadow-lg w-full"
      style={{ borderTop: `4px solid ${collection.color}` }}
      radius="lg"
    >
      {/* static: the name's ::after overlay must cover the whole card, not
          just this body (HeroUI's CardBody is position: relative). */}
      <CardBody className="static pb-1">
        <div className="flex items-center gap-2 mb-2">
          {collection.icon && (
            <span className="text-2xl leading-none">{collection.icon}</span>
          )}
          <button
            type="button"
            onClick={() => onClick(collection)}
            title={collection.name}
            className="font-bold text-base truncate flex-1 min-w-0 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus after:absolute after:inset-0 after:content-['']"
          >
            {collection.name}
          </button>
        </div>
        <Chip
          size="sm"
          className="font-semibold"
          style={{
            backgroundColor: `${collection.color}22`,
            color: collection.color,
          }}
        >
          {t('collections.itemCount', { count })}
        </Chip>
      </CardBody>
      <CardFooter className="relative z-10 pt-0 justify-end gap-1">
        <Tooltip {...ACCESSIBLE_POPOVER} delay={500} content={t('actions.edit')}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label={t('actions.edit')}
            onPress={() => {
              onEdit(collection);
            }}
          >
            <Pencil size={16} />
          </Button>
        </Tooltip>
        <Tooltip {...ACCESSIBLE_POPOVER} delay={500} content={t('actions.delete')}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="danger"
            aria-label={t('actions.delete')}
            onPress={() => onDelete(collection)}
          >
            <Trash2 size={16} />
          </Button>
        </Tooltip>
      </CardFooter>
    </Card>
  );
}
