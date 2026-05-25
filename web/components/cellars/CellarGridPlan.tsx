'use client';

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Thermostat as HotIcon,
  AcUnit as ColdIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GridItem, CellarGridData } from '@/lib/cellars/types';
import { useAssignSlot } from '@/hooks/useCellars';

// ─── Color mapping ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'wine:red': '#C62828',
  'wine:white': '#F9A825',
  'wine:rosé': '#E91E63',
  'wine:orange': '#E65100',
  'wine:': '#7B1FA2',
  sparkling: '#FDD835',
  spirit: '#6D4C41',
  cigar: '#4E342E',
};

function getCellColor(item: GridItem): string {
  if (item.category === 'wine') {
    return CATEGORY_COLORS[`wine:${item.color ?? ''}`] ?? CATEGORY_COLORS['wine:'];
  }
  return CATEGORY_COLORS[item.category] ?? '#9E9E9E';
}

// ─── Zone helpers ─────────────────────────────────────────────────────────────

type ZoneType = 'hot' | 'cold' | 'temperate';

function getZone(row: number, totalRows: number, hotZoneRows: number, coldZoneRows: number): ZoneType {
  if (hotZoneRows > 0 && row <= hotZoneRows) return 'hot';
  if (coldZoneRows > 0 && row > totalRows - coldZoneRows) return 'cold';
  return 'temperate';
}

const ZONE_BG: Record<ZoneType, string> = {
  hot: 'rgba(255, 167, 38, 0.18)',
  cold: 'rgba(33, 150, 243, 0.18)',
  temperate: 'transparent',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface GridCellProps {
  item: GridItem | null;
  zone: ZoneType;
  onClickEmpty: () => void;
  onClickOccupied: (item: GridItem) => void;
}

function GridCell({ item, zone, onClickEmpty, onClickOccupied }: GridCellProps) {
  const { t } = useTranslation();
  const bgColor = ZONE_BG[zone];

  if (!item) {
    return (
      <Tooltip title={t('cellars.grid.cellEmpty')} placement="top">
        <Box
          onClick={onClickEmpty}
          sx={{
            width: { xs: 28, sm: 36, md: 44 },
            height: { xs: 28, sm: 36, md: 44 },
            border: '1.5px dashed',
            borderColor: zone === 'hot' ? 'warning.light' : zone === 'cold' ? 'info.light' : 'divider',
            borderRadius: 0.5,
            bgcolor: bgColor,
            cursor: 'pointer',
            transition: 'all 0.15s',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        />
      </Tooltip>
    );
  }

  const label = item.vintage ? `${item.name.slice(0, 6)} ${item.vintage}` : item.name.slice(0, 8);
  const tooltipContent = [item.name, item.producer, item.vintage].filter(Boolean).join(' · ');

  return (
    <Tooltip title={tooltipContent} placement="top">
      <Box
        onClick={() => onClickOccupied(item)}
        sx={{
          width: { xs: 28, sm: 36, md: 44 },
          height: { xs: 28, sm: 36, md: 44 },
          bgcolor: getCellColor(item),
          borderRadius: 0.5,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'all 0.15s',
          outline: zone !== 'temperate' ? `2px solid ${zone === 'hot' ? 'rgba(255,167,38,0.7)' : 'rgba(33,150,243,0.7)'}` : 'none',
          outlineOffset: '-2px',
          '&:hover': { filter: 'brightness(1.2)', transform: 'scale(1.08)' },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: '#fff',
            fontSize: { xs: '6px', sm: '7px', md: '8px' },
            fontWeight: 600,
            lineHeight: 1,
            textAlign: 'center',
            px: 0.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function GridLegend({ items }: { items: GridItem[] }) {
  const { t } = useTranslation();
  const present = useMemo(() => {
    const keys = new Set<string>();
    items.forEach((item) => {
      if (item.slotColumn != null) {
        const key = item.category === 'wine' ? `wine:${item.color ?? ''}` : item.category;
        keys.add(key);
      }
    });
    return Array.from(keys);
  }, [items]);

  if (present.length === 0) return null;

  const labelFor = (key: string) => {
    if (key.startsWith('wine:')) {
      const color = key.split(':')[1];
      return color ? `${t('categories.wine')} ${t(`inventory.color.${color}`)}` : t('categories.wine');
    }
    return t(`categories.${key}`);
  };

  return (
    <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
      {present.map((key) => (
        <Chip
          key={key}
          size="small"
          label={labelFor(key)}
          sx={{ bgcolor: CATEGORY_COLORS[key] ?? '#9E9E9E', color: '#fff', fontWeight: 600, fontSize: 11 }}
        />
      ))}
    </Box>
  );
}

// ─── Assign dialog ────────────────────────────────────────────────────────────

interface AssignDialogProps {
  open: boolean;
  targetCol: number;
  targetRow: number;
  unassignedItems: GridItem[];
  cellarId: string;
  onClose: () => void;
}

function AssignDialog({ open, targetCol, targetRow, unassignedItems, cellarId, onClose }: AssignDialogProps) {
  const { t } = useTranslation();
  const assignSlot = useAssignSlot(cellarId);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async (itemId: string) => {
    setError(null);
    try {
      await assignSlot.mutateAsync({ itemId, slotColumn: targetCol, slotRow: targetRow });
      onClose();
    } catch (err: any) {
      setError(err?.message === 'SLOT_OCCUPIED' ? t('cellars.grid.slotOccupied') : t('status.error'));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('cellars.grid.assignTitle', { col: targetCol, row: targetRow })}</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {error && <Alert severity="error" sx={{ mx: 2, mt: 1 }}>{error}</Alert>}
        {unassignedItems.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
            {t('cellars.grid.noUnassignedBottles')}
          </Typography>
        ) : (
          <List dense>
            {unassignedItems.map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton onClick={() => handleAssign(item.id)} disabled={assignSlot.isPending}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: getCellColor(item),
                      mr: 1.5,
                      flexShrink: 0,
                    }}
                  />
                  <ListItemText
                    primary={item.name}
                    secondary={[item.producer, item.vintage].filter(Boolean).join(' · ')}
                  />
                  {assignSlot.isPending && <CircularProgress size={16} sx={{ ml: 1 }} />}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.cancel')}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Occupied cell dialog ─────────────────────────────────────────────────────

interface OccupiedDialogProps {
  open: boolean;
  item: GridItem | null;
  cellarId: string;
  onClose: () => void;
}

function OccupiedDialog({ open, item, cellarId, onClose }: OccupiedDialogProps) {
  const { t } = useTranslation();
  const assignSlot = useAssignSlot(cellarId);
  const [error, setError] = useState<string | null>(null);

  const handleRemove = async () => {
    if (!item) return;
    setError(null);
    try {
      await assignSlot.mutateAsync({ itemId: item.id, slotColumn: null, slotRow: null });
      onClose();
    } catch {
      setError(t('status.error'));
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{item.name}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">{item.producer}</Typography>
        {item.vintage && (
          <Typography variant="body2" color="text.secondary">{t('inventory.fields.vintage')}: {item.vintage}</Typography>
        )}
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          {t(`categories.${item.category}`)}
          {item.category === 'wine' && item.color && ` · ${t(`inventory.color.${item.color}`)}`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('actions.close')}</Button>
        <Button
          color="warning"
          onClick={handleRemove}
          disabled={assignSlot.isPending}
        >
          {t('cellars.grid.removeFromSlot')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CellarGridPlanProps {
  data: CellarGridData;
}

export function CellarGridPlan({ data }: CellarGridPlanProps) {
  const { t } = useTranslation();
  const { cellar, items } = data;

  const [assignTarget, setAssignTarget] = useState<{ col: number; row: number } | null>(null);
  const [occupiedTarget, setOccupiedTarget] = useState<GridItem | null>(null);

  const cols = cellar.columns ?? 0;
  const rows = cellar.rows ?? 0;
  const hotZoneRows = cellar.hotZoneRows ?? 0;
  const coldZoneRows = cellar.coldZoneRows ?? 0;

  // Build a lookup map: "col:row" → GridItem
  const slotMap = useMemo(() => {
    const map = new Map<string, GridItem>();
    items.forEach((item) => {
      if (item.slotColumn != null && item.slotRow != null) {
        map.set(`${item.slotColumn}:${item.slotRow}`, item);
      }
    });
    return map;
  }, [items]);

  const assignedCount = slotMap.size;
  const totalSlots = cols * rows;
  const freeSlots = totalSlots - assignedCount;

  const unassignedItems = useMemo(
    () => items.filter((item) => item.slotColumn == null || item.slotRow == null),
    [items]
  );

  if (cols === 0 || rows === 0) {
    return (
      <Alert severity="info">{t('cellars.grid.notConfigured')}</Alert>
    );
  }

  return (
    <Box>
      {/* Occupancy summary */}
      <Box display="flex" gap={1} flexWrap="wrap" mb={2} alignItems="center">
        <Chip
          size="small"
          label={`${assignedCount} / ${totalSlots} ${t('cellars.grid.occupied')}`}
          color="primary"
          variant="outlined"
        />
        <Chip
          size="small"
          label={`${freeSlots} ${t('cellars.grid.free')}`}
          variant="outlined"
        />
        {hotZoneRows > 0 && (
          <Chip
            size="small"
            icon={<HotIcon />}
            label={t('cellars.grid.hotZone', { count: hotZoneRows })}
            sx={{ bgcolor: 'rgba(255,167,38,0.15)', borderColor: 'warning.light' }}
            variant="outlined"
          />
        )}
        {coldZoneRows > 0 && (
          <Chip
            size="small"
            icon={<ColdIcon />}
            label={t('cellars.grid.coldZone', { count: coldZoneRows })}
            sx={{ bgcolor: 'rgba(33,150,243,0.15)', borderColor: 'info.light' }}
            variant="outlined"
          />
        )}
      </Box>

      {/* Grid */}
      <Box
        sx={{
          overflowX: 'auto',
          pb: 1,
        }}
      >
        <Box
          sx={{
            display: 'inline-grid',
            gridTemplateColumns: `repeat(${cols}, auto)`,
            gap: { xs: '3px', sm: '4px' },
          }}
        >
          {Array.from({ length: rows }, (_, rowIdx) => {
            const row = rowIdx + 1;
            const zone = getZone(row, rows, hotZoneRows, coldZoneRows);
            return Array.from({ length: cols }, (_, colIdx) => {
              const col = colIdx + 1;
              const item = slotMap.get(`${col}:${row}`) ?? null;
              return (
                <GridCell
                  key={`${col}:${row}`}
                  item={item}
                  zone={zone}
                  onClickEmpty={() => setAssignTarget({ col, row })}
                  onClickOccupied={(it) => setOccupiedTarget(it)}
                />
              );
            });
          })}
        </Box>
      </Box>

      {/* Zone legend */}
      {(hotZoneRows > 0 || coldZoneRows > 0) && (
        <Box display="flex" gap={2} mt={1.5} flexWrap="wrap">
          {hotZoneRows > 0 && (
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: 14, height: 14, bgcolor: 'rgba(255,167,38,0.4)', borderRadius: 0.5, border: '1px solid rgba(255,167,38,0.7)' }} />
              <Typography variant="caption" color="text.secondary">{t('cellars.grid.hotZoneLabel')}</Typography>
            </Box>
          )}
          {coldZoneRows > 0 && (
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: 14, height: 14, bgcolor: 'rgba(33,150,243,0.4)', borderRadius: 0.5, border: '1px solid rgba(33,150,243,0.7)' }} />
              <Typography variant="caption" color="text.secondary">{t('cellars.grid.coldZoneLabel')}</Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Category legend */}
      <GridLegend items={items} />

      {/* Dialogs */}
      <AssignDialog
        open={!!assignTarget}
        targetCol={assignTarget?.col ?? 0}
        targetRow={assignTarget?.row ?? 0}
        unassignedItems={unassignedItems}
        cellarId={cellar.id}
        onClose={() => setAssignTarget(null)}
      />
      <OccupiedDialog
        open={!!occupiedTarget}
        item={occupiedTarget}
        cellarId={cellar.id}
        onClose={() => setOccupiedTarget(null)}
      />
    </Box>
  );
}
