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
} from '@mui/icons-material';
import WineBarIcon from '@mui/icons-material/WineBar';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import PlaceIcon from '@mui/icons-material/Place';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <WineBarIcon sx={{ fontSize: 14 }} />,
  sparkling: <BubbleChartIcon sx={{ fontSize: 14 }} />,
  spirit: <SportsMmaIcon sx={{ fontSize: 14 }} />,
  cigar: <GrassIcon sx={{ fontSize: 14 }} />,
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
  cellarName?: string;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onView?: (item: InventoryItem) => void;
  t: (key: string) => string;
  isSelected?: boolean;
  onSelectToggle?: (item: InventoryItem) => void;
}

export function InventoryCard({
  item,
  categoryLabel,
  cellarName,
  onEdit,
  onDelete,
  onView,
  t,
  isSelected = false,
  onSelectToggle,
}: InventoryCardProps) {
  const isTemp = item.id.startsWith('temp-');
  const hasMounted = useHasMounted();
  const fillLevel = item.isOpened ? (item.fillLevel ?? 0) : 100;

  const drinkingWindow =
    item.peakMaturityFrom && item.peakMaturityTo
      ? `${item.peakMaturityFrom} – ${item.peakMaturityTo}`
      : item.peakMaturityFrom
      ? `≥ ${item.peakMaturityFrom}`
      : item.peakMaturityTo
      ? `≤ ${item.peakMaturityTo}`
      : null;

  return (
    <Card
      sx={{
        position: 'relative',
        opacity: isTemp ? 0.75 : 1,
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
        display: 'flex',
        flexDirection: 'column',
      }}
      aria-label={`${item.name} — ${categoryLabel}`}
    >
      {/* ── Top chips ─────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, pt: 1.25, pb: 0.5 }}>
        <Chip
          icon={CATEGORY_ICONS[item.category]}
          label={categoryLabel.toUpperCase()}
          size="small"
          variant="outlined"
          color={item.category === 'wine' || item.category === 'sparkling' ? 'secondary' : item.category === 'spirit' ? 'default' : 'warning'}
          sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '.05rem', '& .MuiChip-label': { px: 0.75 } }}
        />
        {cellarName && (
          <Chip
            icon={<PlaceIcon sx={{ fontSize: '11px !important' }} />}
            label={cellarName}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.6rem',
              fontWeight: 600,
              bgcolor: 'rgba(123,30,48,0.08)',
              color: 'secondary.main',
              border: '1px solid',
              borderColor: 'rgba(123,30,48,0.2)',
              '& .MuiChip-label': { px: 0.75 },
              '& .MuiChip-icon': { color: 'secondary.main' },
            }}
          />
        )}
      </Box>

      {/* ── Image / placeholder + fill badge ─────────────────── */}
      <Box
        sx={{ position: 'relative', cursor: onView ? 'pointer' : 'default' }}
        onClick={() => onView?.(item)}
      >
        {item.photoUrl ? (
          <CardMedia
            component="img"
            height={120}
            image={item.photoUrl}
            alt={item.name}
            sx={{ objectFit: 'contain', bgcolor: 'background.paper' }}
          />
        ) : (
          <Box
            sx={{
              height: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: CATEGORY_PLACEHOLDER_BG[item.category],
              fontSize: '2.5rem',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            {CATEGORY_ICONS[item.category]}
          </Box>
        )}

        {/* Fill level badge */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: fillLevel <= 20 ? 'error.main' : '#111',
            color: '#fff',
            borderRadius: 1.5,
            px: 0.75,
            py: 0.25,
            fontSize: '0.65rem',
            fontWeight: 700,
            lineHeight: 1.4,
            letterSpacing: '.03rem',
          }}
        >
          {fillLevel}%
        </Box>

        {/* Bulk select checkbox */}
        {onSelectToggle && (
          <Box sx={{ position: 'absolute', top: 4, left: 4 }}>
            <Checkbox
              checked={isSelected}
              onChange={() => onSelectToggle(item)}
              size="small"
              sx={{ p: 0.5, bgcolor: 'background.paper', borderRadius: 1 }}
            />
          </Box>
        )}
      </Box>

      {/* ── Collection chips ──────────────────────────────────── */}
      {item.collections && item.collections.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', px: 1.5, pt: 0.75 }}>
          {item.collections.slice(0, 2).map((col) => (
            <Chip
              key={col.id}
              label={col.name}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                bgcolor: `${col.color}22`,
                borderColor: col.color,
                color: col.color,
                border: '1px solid',
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          ))}
          {item.collections.length > 2 && (
            <Chip
              label={`+${item.collections.length - 2}`}
              size="small"
              variant="outlined"
              sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }}
            />
          )}
        </Box>
      )}

      {/* ── Card body ─────────────────────────────────────────── */}
      <CardContent
        sx={{ pt: 1, pb: 0.5, px: 1.5, flex: 1, cursor: onView ? 'pointer' : 'default' }}
        onClick={() => onView?.(item)}
      >
        {/* Producer */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontWeight: 700,
            fontSize: '0.6rem',
            letterSpacing: '.08rem',
            textTransform: 'uppercase',
            color: 'text.secondary',
            mb: 0.25,
          }}
          noWrap
        >
          {item.producer}
        </Typography>

        {/* Name */}
        <Typography
          variant="subtitle2"
          fontWeight={500}
          noWrap
          sx={{ lineHeight: 1.3, mb: 0.5 }}
        >
          {item.name}
        </Typography>

        {/* Vintage + drinking window */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'nowrap', overflow: 'hidden' }}>
          {item.vintage && (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, flexShrink: 0 }}>
              {item.vintage}
            </Typography>
          )}
          {drinkingWindow && (
            <Tooltip title={t(`inventory.alertStatus.${item.alertStatus ?? 'none'}`)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, overflow: 'hidden', minWidth: 0 }}>
                <WarningAmberIcon
                  sx={{
                    fontSize: 12,
                    flexShrink: 0,
                    color: item.alertStatus === 'peak' ? 'success.main'
                      : item.alertStatus === 'past' ? 'error.main'
                      : item.alertStatus === 'approaching' ? 'info.main'
                      : 'text.disabled',
                  }}
                />
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.65rem' }}>
                  Apogée : {drinkingWindow}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
      </CardContent>

      {/* ── Actions ───────────────────────────────────────────── */}
      <CardActions sx={{ pt: 0, px: 1, pb: 0.75, justifyContent: 'flex-end' }}>
        <Tooltip title={t('actions.edit')}>
          <span>
            <IconButton
              size="small"
              onClick={() => onEdit(item)}
              disabled={isTemp}
              aria-label={t('actions.edit')}
              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
            >
              <EditIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t('actions.delete')}>
          <span>
            <IconButton
              size="small"
              onClick={() => onDelete(item)}
              disabled={isTemp}
              aria-label={t('actions.delete')}
              sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
            >
              <DeleteIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
      </CardActions>
    </Card>
  );
}

export function InventoryCardSkeleton() {
  return (
    <Card>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1.5, pt: 1.25, pb: 0.5 }}>
        <Skeleton variant="rounded" width={50} height={20} />
        <Skeleton variant="rounded" width={60} height={20} />
      </Box>
      <Skeleton variant="rectangular" height={120} />
      <CardContent sx={{ pt: 1, px: 1.5 }}>
        <Skeleton variant="text" width="60%" height={14} />
        <Skeleton variant="text" width="85%" height={20} />
        <Skeleton variant="text" width="70%" height={14} />
      </CardContent>
    </Card>
  );
}
