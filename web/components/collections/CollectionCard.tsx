'use client';
import React from 'react';
import {
  Card, CardContent, CardActions, Typography, Box,
  IconButton, Tooltip, Chip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
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
      sx={{
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
        borderTop: `4px solid ${collection.color}`,
      }}
      onClick={() => onClick(collection)}
    >
      <CardContent sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {collection.icon && (
            <Typography sx={{ fontSize: '1.4rem', lineHeight: 1 }}>{collection.icon}</Typography>
          )}
          <Typography variant="h6" fontWeight={700} noWrap sx={{ flex: 1 }}>
            {collection.name}
          </Typography>
        </Box>
        <Chip
          label={t('collections.itemCount', { count })}
          size="small"
          sx={{ bgcolor: `${collection.color}22`, color: collection.color, fontWeight: 600 }}
        />
      </CardContent>
      <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
        <Tooltip title={t('actions.edit')}>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onEdit(collection); }}
            aria-label={t('actions.edit')}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('actions.delete')}>
          <IconButton
            size="small"
            color="error"
            onClick={(e) => { e.stopPropagation(); onDelete(collection); }}
            aria-label={t('actions.delete')}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
}
