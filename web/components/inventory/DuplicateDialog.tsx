'use client';
import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Chip, Stack, Divider,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { InventoryItem } from '@/lib/inventory/types';
import { Cellar } from '@/lib/cellars/types';

interface DuplicateDialogProps {
  duplicate: InventoryItem;
  candidate: Partial<InventoryItem>;
  cellars: Cellar[];
  t: (key: string, options?: Record<string, unknown>) => string;
  onIncrement: () => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}

export function DuplicateDialog({
  duplicate,
  candidate,
  cellars,
  t,
  onIncrement,
  onCreateAnyway,
  onCancel,
}: DuplicateDialogProps) {
  const cellarName = duplicate.cellarId
    ? (cellars.find((c) => c.id === duplicate.cellarId)?.name ?? duplicate.cellarId)
    : null;

  const currentQty = duplicate.quantity ?? 1;
  const addedQty = candidate.quantity ?? 1;
  const newQty = currentQty + addedQty;

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <WarningAmberIcon color="warning" fontSize="small" />
          <span>{t('duplicate.title')}</span>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('duplicate.description', { name: duplicate.name, producer: duplicate.producer })}
        </Typography>

        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">
              {t('duplicate.currentQuantity', { count: currentQty })}
            </Typography>
            <Chip label={`→ ${newQty}`} size="small" color="primary" variant="outlined" />
          </Stack>

          {cellarName ? (
            <Typography variant="caption" color="text.secondary">
              {t('duplicate.cellar', { cellar: cellarName })}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {t('duplicate.noCellar')}
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onIncrement} fullWidth>
          {t('duplicate.increment')}
        </Button>
        <Button variant="outlined" onClick={onCreateAnyway} fullWidth>
          {t('duplicate.createAnyway')}
        </Button>
        <Button variant="text" onClick={onCancel} fullWidth>
          {t('duplicate.cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
