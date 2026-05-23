'use client';
import React, { useState } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useCellars } from '@/hooks/useCellars';
import { useInventoryItem, useInventoryItemHistory } from '@/hooks/useInventory';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, Typography, Chip, Box, Divider, Stack,
  Collapse, CircularProgress, Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NotificationsIcon from '@mui/icons-material/Notifications';
import WineBarIcon from '@mui/icons-material/WineBar';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import HistoryIcon from '@mui/icons-material/History';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { InventoryItem, InventoryCategory, InventoryHistoryEntry } from '@/lib/inventory/types';
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

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  if (value === null || value === undefined || value === '' || value === false) return null;
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1 }}>
        {typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? (
          <Typography variant="body2">{String(value)}</Typography>
        ) : (
          value
        )}
      </Box>
    </Box>
  );
}

function HistoryEntryRow({ entry, formatDate, t }: { entry: InventoryHistoryEntry; formatDate: (d: string) => string | null; t: (k: string) => string }) {
  const actionLabel: Record<string, string> = {
    CREATE: t('traceability.actions.create'),
    UPDATE: t('traceability.actions.update'),
    DELETE: t('traceability.actions.delete'),
    RESTORE: t('traceability.actions.restore'),
  };
  return (
    <Box sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
        <Typography variant="caption" fontWeight={600} color="text.primary">
          {actionLabel[entry.action] ?? entry.action}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDate(entry.createdAt)}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {entry.actorName}
      </Typography>
      {entry.changes && entry.changes.length > 0 && (
        <Box sx={{ mt: 0.5, pl: 1 }}>
          {entry.changes.map((c, i) => (
            <Typography key={i} variant="caption" display="block" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
              {c.field}: {JSON.stringify(c.from)} → {JSON.stringify(c.to)}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

interface InventoryDetailDialogProps {
  item: InventoryItem | null;
  open: boolean;
  onClose: () => void;
  onEdit: (item: InventoryItem) => void;
  t: (key: string) => string;
}

export function InventoryDetailDialog({ item, open, onClose, onEdit, t }: InventoryDetailDialogProps) {
  const hasMounted = useHasMounted();
  const { data: cellars } = useCellars();
  const [showHistory, setShowHistory] = useState(false);

  const { data: enrichedItem } = useInventoryItem(item?.id ?? '');
  const { data: history, isLoading: historyLoading } = useInventoryItemHistory(item?.id ?? '', showHistory);

  if (!item) return null;

  const displayItem = enrichedItem ?? item;
  const creator = enrichedItem?._creator ?? null;
  const lastEditor = enrichedItem?._lastEditor ?? null;

  const cellarName = displayItem.cellarId
    ? cellars?.find((c) => c.id === displayItem.cellarId)?.name ?? null
    : null;

  const isWineOrSparkling = displayItem.category === 'wine' || displayItem.category === 'sparkling';
  const isSparkling = displayItem.category === 'sparkling';
  const isSpirit = displayItem.category === 'spirit';
  const isCigar = displayItem.category === 'cigar';

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr || !hasMounted) return null;
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr || !hasMounted) return null;
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            icon={CATEGORY_ICONS[displayItem.category]}
            label={t(`categories.${displayItem.category}`)}
            color={CATEGORY_COLORS[displayItem.category]}
            size="small"
          />
          <Typography variant="h6" component="span" fontWeight={600}>
            {displayItem.name}
            {displayItem.vintage ? ` · ${displayItem.vintage}` : ''}
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', top: 8, right: 8 }}
          aria-label={t('actions.close')}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: 3 }}>
        <Stack spacing={2} divider={<Divider flexItem />}>
          {/* Identity */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {t('inventory.step1')}
            </Typography>
            <DetailRow label={t('inventory.fields.producer')} value={displayItem.producer} />
            <DetailRow label={t('cellars.name')} value={cellarName} />
            <DetailRow label={t('inventory.fields.location')} value={displayItem.location} />
            <DetailRow label={t('inventory.fields.collection')} value={displayItem.collection} />
          </Box>

          {/* Category-specific fields */}
          {(isWineOrSparkling || isSpirit || isCigar) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('inventory.step2')}
              </Typography>

              {isWineOrSparkling && (
                <>
                  <DetailRow label={t('inventory.fields.vintage')} value={displayItem.vintage} />
                  <DetailRow
                    label={t('inventory.fields.color')}
                    value={displayItem.color ? t(`inventory.color.${displayItem.color}`) : null}
                  />
                  <DetailRow label={t('inventory.fields.region')} value={displayItem.region} />
                  <DetailRow
                    label={t('inventory.fields.grapeVarieties')}
                    value={displayItem.grapeVarieties?.length ? displayItem.grapeVarieties.join(', ') : null}
                  />
                  <DetailRow label={t('inventory.fields.alcoholDegree')} value={displayItem.alcoholDegree != null ? `${displayItem.alcoholDegree}%` : null} />
                  <DetailRow label={t('inventory.fields.bottleSize')} value={displayItem.bottleSize} />
                  <DetailRow
                    label={t('inventory.fields.needsAeration')}
                    value={displayItem.needsAeration ? t('inventory.fields.needsAeration') : null}
                  />
                  <DetailRow label={t('inventory.fields.serviceTemp')} value={displayItem.serviceTemp} />
                  <DetailRow label={t('inventory.fields.lotNumber')} value={displayItem.lotNumber} />
                </>
              )}

              {isSparkling && (
                <>
                  <DetailRow
                    label={t('inventory.fields.sparklingType')}
                    value={displayItem.sparklingType ? t(`inventory.sparklingTypes.${displayItem.sparklingType}`) : null}
                  />
                  <DetailRow label={t('inventory.fields.sugarLevel')} value={displayItem.sugarLevel} />
                  <DetailRow label={t('inventory.fields.baseYear')} value={displayItem.baseYear} />
                </>
              )}

              {isSpirit && (
                <>
                  <DetailRow label={t('inventory.fields.edition')} value={displayItem.edition} />
                  <DetailRow label={t('inventory.fields.declaredAge')} value={displayItem.declaredAge} />
                  <DetailRow label={t('inventory.fields.caskType')} value={displayItem.caskType} />
                  <DetailRow label={t('inventory.fields.additions')} value={displayItem.additions} />
                  <DetailRow label={t('inventory.fields.aromaticProfile')} value={displayItem.aromaticProfile} />
                  <DetailRow label={t('inventory.fields.alcoholDegree')} value={displayItem.alcoholDegree != null ? `${displayItem.alcoholDegree}%` : null} />
                  <DetailRow label={t('inventory.fields.bottleSize')} value={displayItem.bottleSize} />
                </>
              )}

              {isCigar && (
                <>
                  <DetailRow label={t('inventory.fields.format')} value={displayItem.format} />
                  <DetailRow label={t('inventory.fields.quantity')} value={displayItem.quantity} />
                  <DetailRow label={t('inventory.fields.manufactureYear')} value={displayItem.manufactureYear} />
                  <DetailRow
                    label={t('inventory.fields.sealedStatus')}
                    value={displayItem.sealedStatus ? t(`inventory.sealedStatus.${displayItem.sealedStatus}`) : null}
                  />
                  <DetailRow label={t('inventory.fields.leafOrigin')} value={displayItem.leafOrigin} />
                  <DetailRow label={t('inventory.fields.factoryCode')} value={displayItem.factoryCode} />
                  <DetailRow
                    label={t('inventory.fields.recommendedHumidity')}
                    value={displayItem.recommendedHumidity != null ? `${displayItem.recommendedHumidity}%` : null}
                  />
                  <DetailRow label={t('inventory.fields.humidificationSystem')} value={displayItem.humidificationSystem} />
                </>
              )}
            </Box>
          )}

          {/* Peak maturity / drinking window */}
          {(displayItem.peakMaturityFrom || displayItem.peakMaturityTo ||
            (displayItem.alertStatus && displayItem.alertStatus !== 'none')) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('inventory.fields.peakMaturity')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                <DrinkingWindowBadge
                  alertStatus={displayItem.alertStatus}
                  alertsPaused={displayItem.alertsPaused}
                  peakMaturityFrom={displayItem.peakMaturityFrom}
                  peakMaturityTo={displayItem.peakMaturityTo}
                  t={t}
                  size="medium"
                />
              </Box>
              <DetailRow label={t('inventory.fields.peakMaturityFrom')} value={displayItem.peakMaturityFrom} />
              <DetailRow label={t('inventory.fields.peakMaturityTo')} value={displayItem.peakMaturityTo} />
            </Box>
          )}

          {/* Opened status */}
          {(displayItem.isOpened || displayItem.reminderDate) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('inventory.fields.isOpened')}
              </Typography>
              {displayItem.isOpened && (
                <>
                  <DetailRow
                    label={t('inventory.fields.fillLevel')}
                    value={displayItem.fillLevel != null ? `${displayItem.fillLevel}%` : null}
                  />
                  <DetailRow label={t('inventory.fields.openedAt')} value={formatDate(displayItem.openedAt)} />
                </>
              )}
              {displayItem.reminderDate && (
                <DetailRow
                  label={t('inventory.fields.reminderDate')}
                  value={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <NotificationsIcon fontSize="small" color="info" />
                      <Typography variant="body2">{formatDate(displayItem.reminderDate)}</Typography>
                    </Box>
                  }
                />
              )}
            </Box>
          )}

          {/* Purchase info */}
          {(displayItem.purchasePrice != null || displayItem.purchasePlace || displayItem.estimatedValue != null) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('inventory.fields.purchasePrice')}
              </Typography>
              <DetailRow label={t('inventory.fields.purchasePrice')} value={displayItem.purchasePrice != null ? `${displayItem.purchasePrice} €` : null} />
              <DetailRow label={t('inventory.fields.purchasePlace')} value={displayItem.purchasePlace} />
              <DetailRow label={t('inventory.fields.estimatedValue')} value={displayItem.estimatedValue != null ? `${displayItem.estimatedValue} €` : null} />
            </Box>
          )}

          {/* Tags */}
          {item.tags?.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('inventory.fields.tags')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {displayItem.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Box>
            </Box>
          )}

          {/* Notes */}
          {displayItem.notes && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('inventory.fields.notes')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {displayItem.notes}
              </Typography>
            </Box>
          )}

          {/* Traceability */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <PersonOutlineIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" color="text.secondary">
                {t('traceability.title')}
              </Typography>
            </Box>
            {creator && (
              <DetailRow
                label={t('traceability.createdBy')}
                value={
                  <Tooltip title={formatDateTime(displayItem.createdAt) ?? ''}>
                    <Typography variant="body2">{creator.name} · {formatDate(displayItem.createdAt)}</Typography>
                  </Tooltip>
                }
              />
            )}
            {lastEditor && (
              <DetailRow
                label={t('traceability.lastEditedBy')}
                value={
                  <Tooltip title={formatDateTime(displayItem.updatedAt) ?? ''}>
                    <Typography variant="body2">{lastEditor.name} · {formatDate(displayItem.updatedAt)}</Typography>
                  </Tooltip>
                }
              />
            )}
            <Box sx={{ mt: 1 }}>
              <Button
                size="small"
                startIcon={historyLoading ? <CircularProgress size={14} /> : <HistoryIcon fontSize="small" />}
                onClick={() => setShowHistory((v) => !v)}
                disabled={historyLoading}
                sx={{ textTransform: 'none', px: 0 }}
              >
                {showHistory ? t('traceability.hideHistory') : t('traceability.showHistory')}
              </Button>
              <Collapse in={showHistory && !historyLoading}>
                <Box sx={{ mt: 1 }}>
                  {history && history.length === 0 && (
                    <Typography variant="caption" color="text.secondary">{t('traceability.noHistory')}</Typography>
                  )}
                  {history?.map((entry) => (
                    <HistoryEntryRow
                      key={entry.id}
                      entry={entry}
                      formatDate={(d) => formatDateTime(d)}
                      t={t}
                    />
                  ))}
                </Box>
              </Collapse>
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button variant="outlined" onClick={onClose}>
          {t('actions.close')}
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            onClose();
            onEdit(item);
          }}
        >
          {t('actions.edit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
