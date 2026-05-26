'use client';
import React from 'react';
import {
  Card, CardContent, CardActions, Typography, Box,
  IconButton, Tooltip, Rating, Chip, Avatar,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WineBarIcon from '@mui/icons-material/WineBar';
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
    <Card sx={{ transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' } }}>
      <CardContent sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Avatar
              src={note.item?.photoUrl ?? undefined}
              sx={{ width: 36, height: 36, bgcolor: 'primary.light' }}
            >
              <WineBarIcon fontSize="small" />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={700} noWrap>
                {note.item ? `${note.item.name} — ${note.item.producer}` : t('tastings.noItem')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(note.tastedAt).toLocaleDateString()}
                {note.context ? ` · ${note.context}` : ''}
              </Typography>
            </Box>
          </Box>
          {note.rating && (
            <Rating value={note.rating} readOnly size="small" sx={{ flexShrink: 0 }} />
          )}
        </Box>

        {note.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {note.notes}
          </Typography>
        )}

        {note.foodPairing && (
          <Chip label={note.foodPairing} size="small" variant="outlined" sx={{ mt: 0.5 }} />
        )}
      </CardContent>
      <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
        <Tooltip title={t('actions.edit')}>
          <IconButton size="small" onClick={() => onEdit(note)} aria-label={t('actions.edit')}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('actions.delete')}>
          <IconButton size="small" color="error" onClick={() => onDelete(note)} aria-label={t('actions.delete')}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
}
