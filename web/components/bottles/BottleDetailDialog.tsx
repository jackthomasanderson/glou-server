'use client';
import React from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useCellars } from '@/hooks/useCellars';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, Typography, Chip, Box, Divider, Stack,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import NotificationsIcon from '@mui/icons-material/Notifications';
import WineBarIcon from '@mui/icons-material/WineBar';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import { Bottle, BottleCategory } from '@/lib/bottles/types';
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

  if (!bottle) return null;

  const cellarName = bottle.cellarId
    ? cellars?.find((c) => c.id === bottle.cellarId)?.name ?? null
    : null;

  const isWineOrSparkling = bottle.category === 'wine' || bottle.category === 'sparkling';
  const isSparkling = bottle.category === 'sparkling';
  const isSpirit = bottle.category === 'spirit';
  const isCigar = bottle.category === 'cigar';

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr || !hasMounted) return null;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            icon={CATEGORY_ICONS[bottle.category]}
            label={t(`categories.${bottle.category}`)}
            color={CATEGORY_COLORS[bottle.category]}
            size="small"
          />
          <Typography variant="h6" component="span" fontWeight={600}>
            {bottle.name}
            {bottle.vintage ? ` · ${bottle.vintage}` : ''}
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
            <DetailRow label={t('bottle.fields.producer')} value={bottle.producer} />
            <DetailRow label={t('cellars.name')} value={cellarName} />
            <DetailRow label={t('bottle.fields.location')} value={bottle.location} />
            <DetailRow label={t('bottle.fields.collection')} value={bottle.collection} />
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
                    value={bottle.color ? t(`bottle.color.${bottle.color}`) : null}
                  />
                  <DetailRow label={t('bottle.fields.region')} value={bottle.region} />
                  <DetailRow
                    label={t('bottle.fields.grapeVarieties')}
                    value={bottle.grapeVarieties?.length ? bottle.grapeVarieties.join(', ') : null}
                  />
                  <DetailRow label={t('bottle.fields.alcoholDegree')} value={bottle.alcoholDegree != null ? `${bottle.alcoholDegree}%` : null} />
                  <DetailRow label={t('bottle.fields.bottleSize')} value={bottle.bottleSize} />
                  <DetailRow
                    label={t('bottle.fields.needsAeration')}
                    value={bottle.needsAeration ? t('bottle.fields.needsAeration') : null}
                  />
                  <DetailRow label={t('bottle.fields.serviceTemp')} value={bottle.serviceTemp} />
                  <DetailRow label={t('bottle.fields.lotNumber')} value={bottle.lotNumber} />
                </>
              )}

              {isSparkling && (
                <>
                  <DetailRow
                    label={t('bottle.fields.sparklingType')}
                    value={bottle.sparklingType ? t(`bottle.sparklingTypes.${bottle.sparklingType}`) : null}
                  />
                  <DetailRow label={t('bottle.fields.sugarLevel')} value={bottle.sugarLevel} />
                  <DetailRow label={t('bottle.fields.baseYear')} value={bottle.baseYear} />
                </>
              )}

              {isSpirit && (
                <>
                  <DetailRow label={t('bottle.fields.edition')} value={bottle.edition} />
                  <DetailRow label={t('bottle.fields.declaredAge')} value={bottle.declaredAge} />
                  <DetailRow label={t('bottle.fields.caskType')} value={bottle.caskType} />
                  <DetailRow label={t('bottle.fields.additions')} value={bottle.additions} />
                  <DetailRow label={t('bottle.fields.aromaticProfile')} value={bottle.aromaticProfile} />
                  <DetailRow label={t('bottle.fields.alcoholDegree')} value={bottle.alcoholDegree != null ? `${bottle.alcoholDegree}%` : null} />
                  <DetailRow label={t('bottle.fields.bottleSize')} value={bottle.bottleSize} />
                </>
              )}

              {isCigar && (
                <>
                  <DetailRow label={t('bottle.fields.format')} value={bottle.format} />
                  <DetailRow label={t('bottle.fields.quantity')} value={bottle.quantity} />
                  <DetailRow label={t('bottle.fields.manufactureYear')} value={bottle.manufactureYear} />
                  <DetailRow
                    label={t('bottle.fields.sealedStatus')}
                    value={bottle.sealedStatus ? t(`bottle.sealedStatus.${bottle.sealedStatus}`) : null}
                  />
                  <DetailRow label={t('bottle.fields.leafOrigin')} value={bottle.leafOrigin} />
                  <DetailRow label={t('bottle.fields.factoryCode')} value={bottle.factoryCode} />
                  <DetailRow
                    label={t('bottle.fields.recommendedHumidity')}
                    value={bottle.recommendedHumidity != null ? `${bottle.recommendedHumidity}%` : null}
                  />
                  <DetailRow label={t('bottle.fields.humidificationSystem')} value={bottle.humidificationSystem} />
                </>
              )}
            </Box>
          )}

          {/* Peak maturity / drinking window */}
          {(bottle.peakMaturityFrom || bottle.peakMaturityTo || bottle.alertStatus) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.peakMaturity')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                <DrinkingWindowBadge
                  alertStatus={bottle.alertStatus}
                  alertsPaused={bottle.alertsPaused}
                  peakMaturityFrom={bottle.peakMaturityFrom}
                  peakMaturityTo={bottle.peakMaturityTo}
                  t={t}
                  size="medium"
                />
              </Box>
              <DetailRow label={t('bottle.fields.peakMaturityFrom')} value={bottle.peakMaturityFrom} />
              <DetailRow label={t('bottle.fields.peakMaturityTo')} value={bottle.peakMaturityTo} />
            </Box>
          )}

          {/* Opened status */}
          {(bottle.isOpened || bottle.reminderDate) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.isOpened')}
              </Typography>
              {bottle.isOpened && (
                <>
                  <DetailRow
                    label={t('bottle.fields.fillLevel')}
                    value={bottle.fillLevel != null ? `${bottle.fillLevel}%` : null}
                  />
                  <DetailRow label={t('bottle.fields.openedAt')} value={formatDate(bottle.openedAt)} />
                </>
              )}
              {bottle.reminderDate && (
                <DetailRow
                  label={t('bottle.fields.reminderDate')}
                  value={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <NotificationsIcon fontSize="small" color="info" />
                      <Typography variant="body2">{formatDate(bottle.reminderDate)}</Typography>
                    </Box>
                  }
                />
              )}
            </Box>
          )}

          {/* Purchase info */}
          {(bottle.purchasePrice != null || bottle.purchasePlace || bottle.estimatedValue != null) && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.purchasePrice')}
              </Typography>
              <DetailRow label={t('bottle.fields.purchasePrice')} value={bottle.purchasePrice != null ? `${bottle.purchasePrice} €` : null} />
              <DetailRow label={t('bottle.fields.purchasePlace')} value={bottle.purchasePlace} />
              <DetailRow label={t('bottle.fields.estimatedValue')} value={bottle.estimatedValue != null ? `${bottle.estimatedValue} €` : null} />
            </Box>
          )}

          {/* Tags */}
          {bottle.tags?.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.tags')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {bottle.tags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Box>
            </Box>
          )}

          {/* Notes */}
          {bottle.notes && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('bottle.fields.notes')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {bottle.notes}
              </Typography>
            </Box>
          )}
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
