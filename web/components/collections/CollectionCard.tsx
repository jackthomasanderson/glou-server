'use client';
import React from 'react';
import { Card, CardBody, CardFooter, Chip, Button, Tooltip } from '@heroui/react';
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
    <Card
      isPressable
      onPress={() => onClick(collection)}
      className="cursor-pointer transition-shadow hover:shadow-lg w-full"
      style={{ borderTop: `4px solid ${collection.color}` }}
      radius="lg"
    >
      <CardBody className="pb-1">
        <div className="flex items-center gap-2 mb-2">
          {collection.icon && (
            <span className="text-2xl leading-none">{collection.icon}</span>
          )}
          <span className="font-bold text-base truncate flex-1">{collection.name}</span>
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
      <CardFooter className="pt-0 justify-end gap-1">
        <Tooltip content={t('actions.edit')}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label={t('actions.edit')}
            onPress={() => {
              onEdit(collection);
            }}
            onClick={(e) => { e.stopPropagation(); }}
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
            onPress={() => onDelete(collection)}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <Trash2 size={16} />
          </Button>
        </Tooltip>
      </CardFooter>
    </Card>
  );
}
