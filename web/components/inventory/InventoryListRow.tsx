'use client';
import React from 'react';
import {
  TableRow, TableCell, IconButton, Chip, Typography, Box, Tooltip, Checkbox, Skeleton,
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import WineBarIcon from '@mui/icons-material/WineBar';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';
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

interface InventoryListRowProps {
  item: InventoryItem;
  categoryLabel: string;
  cellar?: Cellar;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
  onView?: (item: InventoryItem) => void;
  t: (key: string) => string;
  isSelected?: boolean;
  onSelectToggle?: (item: InventoryItem) => void;
}

export function InventoryListRow({
  item, categoryLabel, cellar,
  onEdit, onDelete, onView, t,
  isSelected = false, onSelectToggle,
}: InventoryListRowProps) {
  const isTemp = item.id.startsWith('temp-');

  const peakLabel =
    item.peakMaturityFrom && item.peakMaturityTo
      ? `${item.peakMaturityFrom}–${item.peakMaturityTo}`
      : item.peakMaturityFrom
        ? `${item.peakMaturityFrom}+`
        : null;

  return (
    <TableRow
      hover
      selected={isSelected}
      sx={{
        opacity: isTemp ? 0.75 : 1,
        cursor: onView && !onSelectToggle ? 'pointer' : 'default',
      }}
      onClick={() => !onSelectToggle && onView?.(item)}
    >
      {onSelectToggle && (
        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onChange={() => onSelectToggle(item)}
            color="primary"
            size="small"
          />
        </TableCell>
      )}

      <TableCell sx={{ width: 40, pr: 0 }}>
        <Tooltip title={categoryLabel}>
          <Chip
            icon={CATEGORY_ICONS[item.category]}
            color={CATEGORY_COLORS[item.category]}
            size="small"
            sx={{ '& .MuiChip-label': { display: 'none' }, minWidth: 0, px: 0.5 }}
          />
        </Tooltip>
      </TableCell>

      <TableCell>
        <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
          {item.name}
        </Typography>
      </TableCell>

      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 160 }}>
          {item.producer}
        </Typography>
      </TableCell>

      <TableCell align="center">
        <Typography variant="body2" color="text.secondary">
          {item.vintage ?? '—'}
        </Typography>
      </TableCell>

      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 120 }}>
          {item.region ?? '—'}
        </Typography>
      </TableCell>

      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 120 }}>
          {cellar?.name ?? '—'}
        </Typography>
      </TableCell>

      <TableCell align="center" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
        <Typography variant="body2" color="text.secondary">
          {peakLabel ?? '—'}
        </Typography>
      </TableCell>

      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
        {item.isOpened ? (
          <Chip
            label={`${item.fillLevel ?? '?'}%`}
            size="small"
            color="warning"
            variant={item.fillLevel === 0 ? 'outlined' : 'filled'}
          />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <DrinkingWindowBadge
              alertStatus={item.alertStatus}
              alertsPaused={item.alertsPaused}
              peakMaturityFrom={item.peakMaturityFrom}
              peakMaturityTo={item.peakMaturityTo}
              t={t}
            />
          </Box>
        )}
      </TableCell>

      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
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
      </TableCell>
    </TableRow>
  );
}

export function InventoryListRowSkeleton() {
  return (
    <TableRow>
      <TableCell sx={{ width: 40 }}><Skeleton variant="rounded" width={28} height={24} /></TableCell>
      <TableCell><Skeleton variant="text" width="70%" /></TableCell>
      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Skeleton variant="text" width="60%" /></TableCell>
      <TableCell><Skeleton variant="text" width={40} /></TableCell>
      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Skeleton variant="text" width="50%" /></TableCell>
      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Skeleton variant="text" width="50%" /></TableCell>
      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Skeleton variant="text" width={60} /></TableCell>
      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Skeleton variant="rounded" width={50} height={22} /></TableCell>
      <TableCell align="right"><Skeleton variant="text" width={60} /></TableCell>
    </TableRow>
  );
}
