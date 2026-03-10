'use client';
import React from 'react';
import {
  Card, CardContent, CardActions, IconButton, Typography,
  Chip, Box, Skeleton, Tooltip, Checkbox,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WineBarIcon from '@mui/icons-material/WineBar';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import { Bottle, BottleCategory } from '@/lib/bottles/types';

const CATEGORY_ICONS: Record<BottleCategory, React.ReactElement> = {
  wine: <WineBarIcon fontSize="small" />,
  sparkling: <BubbleChartIcon fontSize="small" />,
  spirit: <SportsMmaIcon fontSize="small" />,
  cigar: <GrassIcon fontSize="small" />,
};

const CATEGORY_COLORS: Record<BottleCategory, 'secondary' | 'primary' | 'default' | 'warning'> = {
  wine: 'secondary',
  sparkling: 'primary',
  spirit: 'default',
  cigar: 'warning',
};

interface BottleCardProps {
  bottle: Bottle;
  categoryLabel: string;
  onEdit: (bottle: Bottle) => void;
  onDelete: (bottle: Bottle) => void;
  t: (key: string) => string;
  isSelected?: boolean;
  onSelectToggle?: (bottle: Bottle) => void;
}

export function BottleCard({ bottle, categoryLabel, onEdit, onDelete, t, isSelected = false, onSelectToggle }: BottleCardProps) {
  const isTemp = bottle.id.startsWith('temp-');

  return (
    <Card
      sx={{
        position: 'relative',
        opacity: isTemp ? 0.75 : 1,
        transition: 'opacity 0.3s, box-shadow 0.2s',
        '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
      }}
      aria-label={`${bottle.name} — ${categoryLabel}`}
    >
      <CardContent sx={{ pb: 1, pt: onSelectToggle ? 4 : 2 }}>
        {onSelectToggle && (
          <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}>
            <Checkbox
              checked={isSelected}
              onChange={() => onSelectToggle(bottle)}
              color="primary"
            />
          </Box>
        )}

        {/* Category badge */}
        <Chip
          icon={CATEGORY_ICONS[bottle.category]}
          label={categoryLabel}
          color={CATEGORY_COLORS[bottle.category]}
          size="small"
          sx={{ mb: 1 }}
        />

        {/* Main info */}
        <Typography variant="subtitle1" fontWeight={600} noWrap>
          {bottle.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {bottle.producer}
          {bottle.vintage ? ` · ${bottle.vintage}` : ''}
        </Typography>

        {/* Cross-cutting metadata */}
        <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {bottle.region && (
            <Chip label={bottle.region} size="small" variant="outlined" />
          )}
          {bottle.isOpened && (
            <Chip
              label={`${bottle.fillLevel ?? '?'}%`}
              size="small"
              color="warning"
            />
          )}
          {bottle.alertStatus && bottle.alertStatus !== 'none' && (
            <Chip
              label={t(`common.bottle.alertStatus.${bottle.alertStatus}`)}
              size="small"
              color={bottle.alertStatus === 'peak' ? 'success' : 'default'}
            />
          )}
          {bottle.location && (
            <Chip label={bottle.location} size="small" variant="outlined" />
          )}
        </Box>
      </CardContent>

      <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
        <Tooltip title={t('actions.edit')}>
          <span>
            <IconButton
              size="small"
              onClick={() => onEdit(bottle)}
              disabled={isTemp}
              aria-label={t('actions.edit')}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('actions.delete')}>
          <span>
            <IconButton
              size="small"
              color="error"
              onClick={() => onDelete(bottle)}
              disabled={isTemp}
              aria-label={t('actions.delete')}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </CardActions>
    </Card>
  );
}

// Skeleton version for loading state
export function BottleCardSkeleton() {
  return (
    <Card>
      <CardContent>
        <Skeleton variant="rounded" width={80} height={24} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="80%" height={28} />
        <Skeleton variant="text" width="60%" height={20} />
        <Box sx={{ mt: 1, display: 'flex', gap: 0.5 }}>
          <Skeleton variant="rounded" width={60} height={24} />
          <Skeleton variant="rounded" width={50} height={24} />
        </Box>
      </CardContent>
    </Card>
  );
}
