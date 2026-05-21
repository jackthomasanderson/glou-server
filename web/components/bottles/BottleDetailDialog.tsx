'use client';
import React, { useState } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useCellars } from '@/hooks/useCellars';
import { useBottle, useBottleHistory } from '@/hooks/useBottles';
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
import { Bottle, BottleCategory, BottleHistoryEntry } from '@/lib/bottles/types';
import { DrinkingWindowBadge } from './DrinkingWindowBadge';

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

function HistoryEntryRow({ entry, formatDate, t }: { entry: BottleHistoryEntry; formatDate: (d: string) => string | null; t: (k: string) => string }) {
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

interface BottleDetailDialogProps {
  bottle: Bottle | null;
  open: boolean;
  onClose: () => void;
  onEdit: (bottle: Bottle) => void;
  t: (key: string) => string;
}

export function BottleDetailDialog({ bottle, open, onClose, onEdit, t }: BottleDetailDialogProps) {
  const hasMounted = useHasMounted();
  const { data: cellars } = useCellars();
  const [showHistory, setShowHistory] = useState(false);

  const { data: enrichedBottle } = useBottle(bottle?.id ?? '');
  const { data: history, isLoading: historyLoading } = useBottleHistory(bottle?.id ?? '', showHistory);

  if (!bottle) return null;

  const displayBottle = enrichedBottle ?? bottle;
  const creator = enrichedBottle?._creator ?? null;
  const lastEditor = enrichedBottle?._lastEditor ?? null;

  const cellarName = displayBottle.cellarId
    ? cellars?.find((c) => c.id === displayBottle.cellarId)?.name ?? null
    : null;

  const isWineOrSparkling = displayBottle.category === 'wine' || displayBottle.category === 'sparkling';
  const isSparkling = displayBottle.category === 'sparkling';
  const isSpirit = displayBottle.category === 'spirit';
  const isCigar = displayBottle.category === 'cigar';

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
            icon={CATEGORY_ICONS[displayBottle.category]}
            label={t(`categories.${displayBottle.category}`)}
            color={CATEGORY_COLORS[displayBottle.category]}
            size="small"
          />
          <Typography variant="h6" component="span" fontWeight={600}>
            {displayBottle.name}
            {displayBottle.vintage ? ` · ${displayBottle.vintage}` : ''}
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
              {t('bottle.step1')}
            </Typography>
            <DetailRow label={t('bottle.fields.producer')} value={displayBottle.producer} />
            <DetailRow label={t('cellars.name')} value={cellarName} />
            <DetailRow label={t('bottle.fields.location')} value={displayBottle.location} />
            <DetailRow label={t('bottle.fields.collection')} value={displayBottle.collection} />
          </Box>

          {/* Category-specific fields */}
          {(isWineOrSparkling || isSpirit || isCigar) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.step2')}
              </Typography>

              {isWineOrSparkling && (
                <>
                  <DetailRow
                    label={t('bottle.fields.color')}
                    value={displayBottle.color ? t(`bottle.color.${displayBottle.color}`) : null}
                  />
                  <DetailRow label={t('bottle.fields.region')} value={displayBottle.region} />
                  <DetailRow
                    label={t('bottle.fields.grapeVarieties')}
                    value={displayBottle.grapeVarieties?.length ? displayBottle.grapeVarieties.join(', ') : null}
                  />
                  <DetailRow label={t('bottle.fields.alcoholDegree')} value={displayBottle.alcoholDegree != null ? `${displayBottle.alcoholDegree}%` : null} />
                  <DetailRow label={t('bottle.fields.bottleSize')} value={displayBottle.bottleSize} />
                  <DetailRow
                    label={t('bottle.fields.needsAeration')}
                    value={displayBottle.needsAeration ? t('bottle.fields.needsAeration') : null}
                  />
                  <DetailRow label={t('bottle.fields.serviceTemp')} value={displayBottle.serviceTemp} />
                  <DetailRow label={t('bottle.fields.lotNumber')} value={displayBottle.lotNumber} />
                </>
              )}

              {isSparkling && (
                <>
                  <DetailRow
                    label={t('bottle.fields.sparklingType')}
                    value={displayBottle.sparklingType ? t(`bottle.sparklingTypes.${displayBottle.sparklingType}`) : null}
                  />
                  <DetailRow label={t('bottle.fields.sugarLevel')} value={displayBottle.sugarLevel} />
                  <DetailRow label={t('bottle.fields.baseYear')} value={displayBottle.baseYear} />
                </>
              )}

              {isSpirit && (
                <>
                  <DetailRow label={t('bottle.fields.edition')} value={displayBottle.edition} />
                  <DetailRow label={t('bottle.fields.declaredAge')} value={displayBottle.declaredAge} />
                  <DetailRow label={t('bottle.fields.caskType')} value={displayBottle.caskType} />
                  <DetailRow label={t('bottle.fields.additions')} value={displayBottle.additions} />
                  <DetailRow label={t('bottle.fields.aromaticProfile')} value={displayBottle.aromaticProfile} />
                  <DetailRow label={t('bottle.fields.alcoholDegree')} value={displayBottle.alcoholDegree != null ? `${displayBottle.alcoholDegree}%` : null} />
                  <DetailRow label={t('bottle.fields.bottleSize')} value={displayBottle.bottleSize} />
                </>
              )}

              {isCigar && (
                <>
                  <DetailRow label={t('bottle.fields.format')} value={displayBottle.format} />
                  <DetailRow label={t('bottle.fields.quantity')} value={displayBottle.quantity} />
                  <DetailRow label={t('bottle.fields.manufactureYear')} value={displayBottle.manufactureYear} />
                  <DetailRow
                    label={t('bottle.fields.sealedStatus')}
                    value={displayBottle.sealedStatus ? t(`bottle.sealedStatus.${displayBottle.sealedStatus}`) : null}
                  />
                  <DetailRow label={t('bottle.fields.leafOrigin')} value={displayBottle.leafOrigin} />
                  <DetailRow label={t('bottle.fields.factoryCode')} value={displayBottle.factoryCode} />
                  <DetailRow
                    label={t('bottle.fields.recommendedHumidity')}
                    value={displayBottle.recommendedHumidity != null ? `${displayBottle.recommendedHumidity}%` : null}
                  />
                  <DetailRow label={t('bottle.fields.humidificationSystem')} value={displayBottle.humidificationSystem} />
                </>
              )}
            </Box>
          )}

          {/* Peak maturity / drinking window */}
          {(displayBottle.peakMaturityFrom || displayBottle.peakMaturityTo || displayBottle.alertStatus) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.peakMaturity')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                <DrinkingWindowBadge
                  alertStatus={displayBottle.alertStatus}
                  alertsPaused={displayBottle.alertsPaused}
                  peakMaturityFrom={displayBottle.peakMaturityFrom}
                  peakMaturityTo={displayBottle.peakMaturityTo}
                  t={t}
                  size="medium"
                />
              </Box>
              <DetailRow label={t('bottle.fields.peakMaturityFrom')} value={displayBottle.peakMaturityFrom} />
              <DetailRow label={t('bottle.fields.peakMaturityTo')} value={displayBottle.peakMaturityTo} />
            </Box>
          )}

          {/* Opened status */}
          {(displayBottle.isOpened || displayBottle.reminderDate) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.isOpened')}
              </Typography>
              {displayBottle.isOpened && (
                <>
                  <DetailRow
                    label={t('bottle.fields.fillLevel')}
                    value={displayBottle.fillLevel != null ? `${displayBottle.fillLevel}%` : null}
                  />
                  <DetailRow label={t('bottle.fields.openedAt')} value={formatDate(displayBottle.openedAt)} />
                </>
              )}
              {displayBottle.reminderDate && (
                <DetailRow
                  label={t('bottle.fields.reminderDate')}
                  value={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <NotificationsIcon fontSize="small" color="info" />
                      <Typography variant="body2">{formatDate(displayBottle.reminderDate)}</Typography>
                    </Box>
                  }
                />
              )}
            </Box>
          )}

          {/* Purchase info */}
          {(displayBottle.purchasePrice != null || displayBottle.purchasePlace || displayBottle.estimatedValue != null) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.purchasePrice')}
              </Typography>
              <DetailRow label={t('bottle.fields.purchasePrice')} value={displayBottle.purchasePrice != null ? `${displayBottle.purchasePrice} €` : null} />
              <DetailRow label={t('bottle.fields.purchasePlace')} value={displayBottle.purchasePlace} />
              <DetailRow label={t('bottle.fields.estimatedValue')} value={displayBottle.estimatedValue != null ? `${displayBottle.estimatedValue} €` : null} />
            </Box>
          )}

          {/* Tags */}
          {bottle.tags?.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.tags')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {displayBottle.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Box>
            </Box>
          )}

          {/* Notes */}
          {displayBottle.notes && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.notes')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {displayBottle.notes}
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
                  <Tooltip title={formatDateTime(displayBottle.createdAt) ?? ''}>
                    <Typography variant="body2">{creator.name} · {formatDate(displayBottle.createdAt)}</Typography>
                  </Tooltip>
                }
              />
            )}
            {lastEditor && (
              <DetailRow
                label={t('traceability.lastEditedBy')}
                value={
                  <Tooltip title={formatDateTime(displayBottle.updatedAt) ?? ''}>
                    <Typography variant="body2">{lastEditor.name} · {formatDate(displayBottle.updatedAt)}</Typography>
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
            onEdit(bottle);
          }}
        >
          {t('actions.edit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
