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
  wine: <WineBarIcon sx={{ fontSize: 56, opacity: 0.25, color: '#fff' }} />,
  sparkling: <BubbleChartIcon sx={{ fontSize: 56, opacity: 0.25, color: '#fff' }} />,
  spirit: <SportsMmaIcon sx={{ fontSize: 56, opacity: 0.25, color: '#fff' }} />,
  cigar: <GrassIcon sx={{ fontSize: 56, opacity: 0.25, color: '#fff' }} />,
};

const CATEGORY_CHIP_ICONS: Record<InventoryCategory, React.ReactElement> = {
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

const PLACEHOLDER_BG: Record<InventoryCategory, string> = {
  wine: 'linear-gradient(160deg, #3D1A1A 0%, #6B2C2C 100%)',
  sparkling: 'linear-gradient(160deg, #1A2A3D 0%, #2C4A6B 100%)',
  spirit: 'linear-gradient(160deg, #2D2010 0%, #5C4020 100%)',
  cigar: 'linear-gradient(160deg, #2A1A0A 0%, #5C3A1A 100%)',
};

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  if (value === null || value === undefined || value === '' || value === false) return null;
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140, flexShrink: 0 }}>
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

function HistoryEntryRow({ entry, formatDate, t }: {
  entry: InventoryHistoryEntry;
  formatDate: (d: string) => string | null;
  t: (k: string) => string;
}) {
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
      <Typography variant="caption" color="text.secondary">{entry.actorName}</Typography>
      {entry.changes && entry.changes.length > 0 && (
        <Box sx={{ mt: 0.5, pl: 1 }}>
          {entry.changes.map((c, i) => (
            <Typography key={i} variant="caption" display="block" color="text.secondary"
              sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
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

  const d = enrichedItem ?? item;
  const creator = enrichedItem?._creator ?? null;
  const lastEditor = enrichedItem?._lastEditor ?? null;
  const cellarName = d.cellarId ? cellars?.find((c) => c.id === d.cellarId)?.name ?? null : null;

  const isWineOrSparkling = d.category === 'wine' || d.category === 'sparkling';
  const isSparkling = d.category === 'sparkling';
  const isSpirit = d.category === 'spirit';
  const isCigar = d.category === 'cigar';

  const fmt = (s: string | null | undefined) =>
    s && hasMounted ? new Date(s).toLocaleDateString() : null;
  const fmtDt = (s: string | null | undefined) =>
    s && hasMounted ? new Date(s).toLocaleString() : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      {/* ── Title ───────────────────────────────────────────────────── */}
      <DialogTitle sx={{ pr: 6, py: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            icon={CATEGORY_CHIP_ICONS[d.category]}
            label={t(`categories.${d.category}`)}
            color={CATEGORY_COLORS[d.category]}
            size="small"
          />
          <Typography variant="h6" component="span" fontWeight={700}>
            {d.name}
            {d.vintage ? ` · ${d.vintage}` : ''}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', top: 8, right: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', minHeight: { sm: 420 } }}>

          {/* ── LEFT: bottle image panel ───────────────────────────── */}
          <Box
            sx={{
              width: { xs: '100%', sm: 220 },
              maxWidth: { xs: '100%', sm: 220 },
              flexShrink: 0,
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              justifyContent: 'center',
              background: d.photoUrl ? 'none' : PLACEHOLDER_BG[d.category],
              bgcolor: d.photoUrl ? 'background.default' : undefined,
              borderRight: 1,
              borderColor: 'divider',
              p: 2,
              position: 'sticky',
              top: 0,
              alignSelf: 'flex-start',
            }}
          >
            {d.photoUrl ? (
              <Box
                component="img"
                src={d.photoUrl}
                alt={d.name}
                sx={{
                  width: '100%',
                  maxHeight: 380,
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            ) : (
              CATEGORY_ICONS[d.category]
            )}
          </Box>

          {/* ── RIGHT: details ────────────────────────────────────── */}
          <Box sx={{ flex: 1, px: 3, py: 2.5, minWidth: 0, overflowY: 'auto' }}>
            <Stack spacing={2} divider={<Divider flexItem />}>

              {/* Headline: producer + key attributes */}
              <Box>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  {d.producer}
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {d.region && <Chip label={d.region} size="small" variant="outlined" />}
                  {d.color && <Chip label={t(`inventory.color.${d.color}`)} size="small" variant="outlined" />}
                  {isSparkling && d.sparklingType && (
                    <Chip label={t(`inventory.sparklingTypes.${d.sparklingType}`)} size="small" variant="outlined" />
                  )}
                  {d.alcoholDegree != null && (
                    <Chip label={`${d.alcoholDegree}%`} size="small" variant="outlined" />
                  )}
                  {d.bottleSize && <Chip label={d.bottleSize} size="small" variant="outlined" />}
                </Stack>
                {(d.peakMaturityFrom || d.peakMaturityTo || (d.alertStatus && d.alertStatus !== 'none')) && (
                  <Box sx={{ mt: 1.5 }}>
                    <DrinkingWindowBadge
                      alertStatus={d.alertStatus}
                      alertsPaused={d.alertsPaused}
                      peakMaturityFrom={d.peakMaturityFrom}
                      peakMaturityTo={d.peakMaturityTo}
                      t={t}
                      size="medium"
                    />
                  </Box>
                )}
              </Box>

              {/* Identity */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('inventory.step1')}
                </Typography>
                <DetailRow label={t('cellars.name')} value={cellarName} />
                <DetailRow label={t('inventory.fields.location')} value={d.location} />
                <DetailRow label={t('inventory.fields.collection')} value={d.collection} />
                <DetailRow label={t('inventory.fields.tags')} value={
                  d.tags?.length ? (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {d.tags.map((tag) => <Chip key={tag} label={tag} size="small" variant="outlined" />)}
                    </Box>
                  ) : null
                } />
              </Box>

              {/* Category specifics */}
              {(isWineOrSparkling || isSpirit || isCigar) && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t('inventory.step2')}
                  </Typography>
                  {isWineOrSparkling && (
                    <>
                      <DetailRow label={t('inventory.fields.grapeVarieties')}
                        value={d.grapeVarieties?.length ? d.grapeVarieties.join(', ') : null} />
                      <DetailRow label={t('inventory.fields.serviceTemp')} value={d.serviceTemp} />
                      <DetailRow label={t('inventory.fields.lotNumber')} value={d.lotNumber} />
                      {isSparkling && (
                        <>
                          <DetailRow label={t('inventory.fields.sugarLevel')} value={d.sugarLevel} />
                          <DetailRow label={t('inventory.fields.baseYear')} value={d.baseYear} />
                        </>
                      )}
                    </>
                  )}
                  {isSpirit && (
                    <>
                      <DetailRow label={t('inventory.fields.edition')} value={d.edition} />
                      <DetailRow label={t('inventory.fields.declaredAge')} value={d.declaredAge} />
                      <DetailRow label={t('inventory.fields.caskType')} value={d.caskType} />
                      <DetailRow label={t('inventory.fields.additions')} value={d.additions} />
                      <DetailRow label={t('inventory.fields.aromaticProfile')} value={d.aromaticProfile} />
                    </>
                  )}
                  {isCigar && (
                    <>
                      <DetailRow label={t('inventory.fields.format')} value={d.format} />
                      <DetailRow label={t('inventory.fields.quantity')} value={d.quantity} />
                      <DetailRow label={t('inventory.fields.manufactureYear')} value={d.manufactureYear} />
                      <DetailRow label={t('inventory.fields.leafOrigin')} value={d.leafOrigin} />
                      <DetailRow label={t('inventory.fields.factoryCode')} value={d.factoryCode} />
                      <DetailRow label={t('inventory.fields.recommendedHumidity')}
                        value={d.recommendedHumidity != null ? `${d.recommendedHumidity}%` : null} />
                      <DetailRow label={t('inventory.fields.humidificationSystem')} value={d.humidificationSystem} />
                    </>
                  )}
                </Box>
              )}

              {/* Peak maturity window */}
              {(d.peakMaturityFrom || d.peakMaturityTo) && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t('inventory.fields.peakMaturity')}
                  </Typography>
                  <DetailRow label={t('inventory.fields.peakMaturityFrom')} value={d.peakMaturityFrom} />
                  <DetailRow label={t('inventory.fields.peakMaturityTo')} value={d.peakMaturityTo} />
                </Box>
              )}

              {/* Opened status */}
              {(d.isOpened || d.reminderDate) && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t('inventory.fields.isOpened')}
                  </Typography>
                  {d.isOpened && (
                    <>
                      <DetailRow label={t('inventory.fields.fillLevel')}
                        value={d.fillLevel != null ? `${d.fillLevel}%` : null} />
                      <DetailRow label={t('inventory.fields.openedAt')} value={fmt(d.openedAt)} />
                    </>
                  )}
                  {d.reminderDate && (
                    <DetailRow label={t('inventory.fields.reminderDate')} value={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <NotificationsIcon fontSize="small" color="info" />
                        <Typography variant="body2">{fmt(d.reminderDate)}</Typography>
                      </Box>
                    } />
                  )}
                </Box>
              )}

              {/* Purchase */}
              {(d.purchasePrice != null || d.purchasePlace || d.estimatedValue != null) && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t('inventory.fields.purchasePrice')}
                  </Typography>
                  <DetailRow label={t('inventory.fields.purchasePrice')}
                    value={d.purchasePrice != null ? `${d.purchasePrice} €` : null} />
                  <DetailRow label={t('inventory.fields.purchasePlace')} value={d.purchasePlace} />
                  <DetailRow label={t('inventory.fields.estimatedValue')}
                    value={d.estimatedValue != null ? `${d.estimatedValue} €` : null} />
                </Box>
              )}

              {/* Notes */}
              {d.notes && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t('inventory.fields.notes')}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{d.notes}</Typography>
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
                  <DetailRow label={t('traceability.createdBy')} value={
                    <Tooltip title={fmtDt(d.createdAt) ?? ''}>
                      <Typography variant="body2">{creator.name} · {fmt(d.createdAt)}</Typography>
                    </Tooltip>
                  } />
                )}
                {lastEditor && (
                  <DetailRow label={t('traceability.lastEditedBy')} value={
                    <Tooltip title={fmtDt(d.updatedAt) ?? ''}>
                      <Typography variant="body2">{lastEditor.name} · {fmt(d.updatedAt)}</Typography>
                    </Tooltip>
                  } />
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
                        <Typography variant="caption" color="text.secondary">
                          {t('traceability.noHistory')}
                        </Typography>
                      )}
                      {history?.map((entry) => (
                        <HistoryEntryRow key={entry.id} entry={entry} formatDate={fmtDt} t={t} />
                      ))}
                    </Box>
                  </Collapse>
                </Box>
              </Box>

            </Stack>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button variant="outlined" onClick={onClose}>{t('actions.close')}</Button>
        <Button variant="contained" onClick={() => { onClose(); onEdit(item); }}>
          {t('actions.edit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
