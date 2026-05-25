'use client';
import React from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';

import {
  Card, CardContent, CardActions, CardMedia, IconButton, Typography,
  Chip, Box, Skeleton, Tooltip, Checkbox,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Notifications as ReminderIcon,
} from '@mui/icons-material';
import WineBarIcon from '@mui/icons-material/WineBar';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { DrinkingWindowBadge } from './DrinkingWindowBadge';

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <WineBarIcon fontSize="small" />,
  sparkling: <BubbleChartIcon fontSize="small" />,
  spirit: <SportsMmaIcon fontSize="small" />,
  cigar: <GrassIcon fontSize="small" />,
};

const CATEGORY_COLORS: Record<InventoryCategory, 'secondary' | 'primary' | 'default' | 'warning'> = {
  wine: 'secondary',
  sparkling: 'primary',
  spirit: 'default',
  cigar: 'warning',
};

const CATEGORY_PLACEHOLDER_BG: Record<InventoryCategory, string> = {
  wine: 'linear-gradient(160deg, #6B1A2A 0%, #A83254 100%)',
  sparkling: 'linear-gradient(160deg, #1A4A7A 0%, #3B7CC4 100%)',
  spirit: 'linear-gradient(160deg, #3A3A2A 0%, #7A7A4A 100%)',
  cigar: 'linear-gradient(160deg, #4A2E1A 0%, #8B5C2A 100%)',
};

interface InventoryCardProps {
  item: InventoryItem;
  categoryLabel: string;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onView?: (item: InventoryItem) => void;
  t: (key: string) => string;
  isSelected?: boolean;
  onSelectToggle?: (item: InventoryItem) => void;
}

export function InventoryCard({ item, categoryLabel, onEdit, onDelete, onView, t, isSelected = false, onSelectToggle }: InventoryCardProps) {
  const isTemp = item.id.startsWith('temp-');
  const hasMounted = useHasMounted();


  return (
    <Card
      sx={{
        position: 'relative',
        opacity: isTemp ? 0.75 : 1,
        transition: 'opacity 0.3s, box-shadow 0.2s',
        '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
      }}
      aria-label={`${item.name} — ${categoryLabel}`}
    >
      {/* ── Photo / placeholder ─────────────────────────── */}
      {item.photoUrl ? (
        <CardMedia
          component="img"
          height={150}
          image={item.photoUrl}
          alt={item.name}
          sx={{ objectFit: 'contain', bgcolor: 'background.paper', cursor: onView ? 'pointer' : 'default' }}
          onClick={() => onView?.(item)}
        />
      ) : (
        <Box
          onClick={() => onView?.(item)}
          sx={{
            height: 90,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: CATEGORY_PLACEHOLDER_BG[item.category],
            cursor: onView ? 'pointer' : 'default',
            opacity: 0.7,
            fontSize: '2rem',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {CATEGORY_ICONS[item.category]}
        </Box>
      )}

      <CardContent
        sx={{ pb: 1, pt: onSelectToggle ? 4 : 2, cursor: onView ? 'pointer' : 'default' }}
        onClick={() => onView?.(item)}
      >
        {onSelectToggle && (
          <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}>
            <Checkbox
              checked={isSelected}
              onChange={() => onSelectToggle(item)}
              color="primary"
            />
          </Box>
        )}

        {/* Category badge */}
        <Chip
          icon={CATEGORY_ICONS[item.category]}
          label={categoryLabel}
          color={CATEGORY_COLORS[item.category]}
          size="small"
          sx={{ mb: 1 }}
        />

        {/* Main info */}
        <Typography variant="subtitle1" fontWeight={600} noWrap>
          {item.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {item.producer}
          {item.vintage ? ` · ${item.vintage}` : ''}
        </Typography>

        {/* Cross-cutting metadata */}
        <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {item.region && (
            <Chip label={item.region} size="small" variant="outlined" />
          )}
          {item.isOpened && (
            <Tooltip title={item.openedAt && hasMounted ? `${t('inventory.fields.openedAt')}: ${new Date(item.openedAt).toLocaleDateString()}` : ''}>


              <Chip
                label={`${item.fillLevel ?? '?'}%`}
                size="small"
                color="warning"
                variant={item.fillLevel === 0 ? 'outlined' : 'filled'}
              />
            </Tooltip>
          )}
          {item.reminderDate && (
            <Tooltip title={t('inventory.fields.reminderDate')}>
              <Chip
                icon={<ReminderIcon sx={{ fontSize: '1rem !important' }} />}
                label={hasMounted ? new Date(item.reminderDate).toLocaleDateString() : ''}


                size="small"
                color={hasMounted && new Date(item.reminderDate).toISOString().split('T')[0] <= new Date().toISOString().split('T')[0] ? 'error' : 'info'}


                variant="outlined"
              />
            </Tooltip>
          )}
          <DrinkingWindowBadge
            alertStatus={item.alertStatus}
            alertsPaused={item.alertsPaused}
            peakMaturityFrom={item.peakMaturityFrom}
            peakMaturityTo={item.peakMaturityTo}
            t={t}
          />
          {item.location && (
            <Chip label={item.location} size="small" variant="outlined" />
          )}
        </Box>
      </CardContent>

      <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
        <Tooltip title={t('actions.edit')}>
          <span>
            <IconButton
              size="small"
              onClick={() => onEdit(item)}
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
              onClick={() => onDelete(item)}
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
export function InventoryCardSkeleton() {
  return (
    <Card>
      <Skeleton variant="rectangular" height={90} />
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
