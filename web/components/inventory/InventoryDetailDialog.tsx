'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useCellars } from '@/hooks/useCellars';
import { useInventoryItem, useInventoryItemHistory, useUpdateInventoryItem } from '@/hooks/useInventory';
import {
  Box, Typography, IconButton, Chip, Slider, Button, Drawer,
  Divider, Tooltip, CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import PlaceIcon from '@mui/icons-material/Place';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import WineBarIcon from '@mui/icons-material/WineBar';
import SportsMmaIcon from '@mui/icons-material/SportsMma';
import GrassIcon from '@mui/icons-material/Grass';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import { InventoryItem, InventoryCategory, InventoryHistoryEntry } from '@/lib/inventory/types';
import { TastingForm } from '@/components/tastings/TastingForm';

const PLACEHOLDER_BG: Record<InventoryCategory, string> = {
  wine: 'linear-gradient(160deg, #3D1A1A 0%, #6B2C2C 100%)',
  sparkling: 'linear-gradient(160deg, #1A2A3D 0%, #2C4A6B 100%)',
  spirit: 'linear-gradient(160deg, #2D2010 0%, #5C4020 100%)',
  cigar: 'linear-gradient(160deg, #2A1A0A 0%, #5C3A1A 100%)',
};

const CATEGORY_ICONS_LG: Record<InventoryCategory, React.ReactElement> = {
  wine: <WineBarIcon sx={{ fontSize: 64, opacity: 0.2, color: '#fff' }} />,
  sparkling: <BubbleChartIcon sx={{ fontSize: 64, opacity: 0.2, color: '#fff' }} />,
  spirit: <SportsMmaIcon sx={{ fontSize: 64, opacity: 0.2, color: '#fff' }} />,
  cigar: <GrassIcon sx={{ fontSize: 64, opacity: 0.2, color: '#fff' }} />,
};

const DRAWER_WIDTH = 400;

interface InfoCardProps {
  icon: React.ReactElement;
  label: string;
  value: React.ReactNode;
  valueColor?: string;
}

function InfoCard({ icon, label, value, valueColor }: InfoCardProps) {
  return (
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {React.cloneElement(icon, { sx: { fontSize: 14, color: 'text.secondary' } })}
        <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '.08rem', textTransform: 'uppercase', color: 'text.secondary' }}>
          {label}
        </Typography>
      </Box>
      <Typography
        sx={{ fontSize: '0.85rem', fontWeight: 700, color: valueColor ?? 'text.primary', lineHeight: 1.2 }}
      >
        {value}
      </Typography>
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
  const updateMutation = useUpdateInventoryItem();
  const [tastingOpen, setTastingOpen] = useState(false);

  const { data: enrichedItem } = useInventoryItem(item?.id ?? '');
  const { data: history } = useInventoryItemHistory(item?.id ?? '', open);

  const d = enrichedItem ?? item;
  const fillLevel = d?.isOpened ? (d?.fillLevel ?? 0) : 100;
  const [localFill, setLocalFill] = useState(fillLevel);

  useEffect(() => {
    setLocalFill(d?.isOpened ? (d?.fillLevel ?? 0) : 100);
  }, [d?.fillLevel, d?.isOpened, open]);

  const handleFillCommit = useCallback(
    (value: number) => {
      if (!item) return;
      updateMutation.mutate({
        id: item.id,
        patch: {
          fillLevel: value,
          isOpened: value < 100,
          ...(value < 100 && !item.isOpened ? { openedAt: new Date().toISOString() } : {}),
        },
      });
    },
    [item, updateMutation]
  );

  const handlePreset = useCallback(
    (value: number) => {
      setLocalFill(value);
      handleFillCommit(value);
    },
    [handleFillCommit]
  );

  if (!item) return null;
  if (!d) return null;

  const cellarName = d.cellarId ? cellars?.find((c) => c.id === d.cellarId)?.name ?? null : null;
  const isWineOrSparkling = d.category === 'wine' || d.category === 'sparkling';
  const isCigar = d.category === 'cigar';

  const drinkingWindow =
    d.peakMaturityFrom && d.peakMaturityTo
      ? `${d.peakMaturityFrom} – ${d.peakMaturityTo}`
      : d.peakMaturityFrom
      ? `≥ ${d.peakMaturityFrom}`
      : d.peakMaturityTo
      ? `≤ ${d.peakMaturityTo}`
      : null;

  const sectionLabel = isCigar
    ? t('inventory.detail.cigarLevel')
    : isWineOrSparkling
    ? t('inventory.detail.wineLevel')
    : t('inventory.detail.spiritLevel');

  const fullLabel = isCigar ? t('inventory.detail.full') : t('inventory.detail.full');
  const halfLabel = t('inventory.detail.half');
  const emptyLabel = t('inventory.detail.empty');

  const fmt = (s: string | null | undefined) =>
    s && hasMounted ? new Date(s).toLocaleDateString() : null;

  const formatHistoryEntry = (entry: InventoryHistoryEntry): string => {
    if (!entry.changes || entry.changes.length === 0) {
      return t(`traceability.actions.${entry.action.toLowerCase()}`);
    }
    const fillChange = entry.changes.find(c => c.field === 'fillLevel');
    if (fillChange) {
      const val = fillChange.to as number;
      const label = val >= 100 ? t('inventory.detail.full') : val === 0 ? t('inventory.detail.empty') : `${val}%`;
      return `${t('inventory.detail.levelAdjusted')} ${val}% (${label})`;
    }
    return entry.changes.map(c => `${c.field}: ${JSON.stringify(c.to)}`).join(', ');
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: { width: { xs: '100%', sm: DRAWER_WIDTH }, display: 'flex', flexDirection: 'column' },
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <Box sx={{ px: 3, pt: 2.5, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography
            sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '.1rem', textTransform: 'uppercase', color: 'secondary.main', mb: 0.25 }}
          >
            {isCigar ? t('inventory.detail.titleCigar') : t('inventory.detail.titleWine')}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2, pr: 4 }}>
              {d.name}
            </Typography>
            <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* ── Scrollable body ─────────────────────────────────── */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {/* Fill level section */}
          <Box sx={{ px: 3, pt: 2.5 }}>
            <Typography
              sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '.1rem', textTransform: 'uppercase', color: 'text.secondary', mb: 2, textAlign: 'center' }}
            >
              {sectionLabel}
            </Typography>

            {/* Image + fill badge */}
            <Box
              sx={{
                position: 'relative',
                height: 160,
                borderRadius: 2,
                overflow: 'hidden',
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: d.photoUrl ? 'none' : PLACEHOLDER_BG[d.category],
                bgcolor: d.photoUrl ? 'background.default' : undefined,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              {d.photoUrl ? (
                <Box
                  component="img"
                  src={d.photoUrl}
                  alt={d.name}
                  sx={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                />
              ) : (
                CATEGORY_ICONS_LG[d.category]
              )}
              <Box
                sx={{
                  position: 'absolute',
                  top: 10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  bgcolor: localFill <= 20 ? 'error.main' : '#111',
                  color: '#fff',
                  borderRadius: 2,
                  px: 1,
                  py: 0.35,
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '.03rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {localFill}%
              </Box>
            </Box>

            {/* Slider */}
            <Box sx={{ mb: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {isCigar ? t('inventory.detail.levelCigar') : t('inventory.detail.levelWine')}
                </Typography>
                <Typography variant="body2" color="primary" fontWeight={700}>
                  {localFill}%
                </Typography>
              </Box>
              <Slider
                value={localFill}
                onChange={(_, v) => setLocalFill(v as number)}
                onChangeCommitted={(_, v) => handleFillCommit(v as number)}
                min={0}
                max={100}
                step={1}
                disabled={updateMutation.isPending}
                sx={{ py: 1 }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {t('inventory.detail.empty')} (0%)
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {isCigar ? t('inventory.detail.inUse') : t('inventory.detail.opened')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {fullLabel} (100%)
                </Typography>
              </Box>
            </Box>

            {/* Preset buttons */}
            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              {[
                { label: fullLabel, value: 100 },
                { label: halfLabel, value: 50 },
                { label: emptyLabel, value: 0 },
              ].map(({ label, value }) => (
                <Button
                  key={value}
                  variant={localFill === value ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => handlePreset(value)}
                  disabled={updateMutation.isPending}
                  sx={{ flex: 1, py: 0.75, fontSize: '0.75rem' }}
                >
                  {label}
                </Button>
              ))}
            </Box>
          </Box>

          <Divider sx={{ my: 2.5 }} />

          {/* Info cards grid */}
          <Box sx={{ px: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2.5 }}>
              {drinkingWindow && (
                <InfoCard
                  icon={<LocalFireDepartmentIcon />}
                  label={isCigar ? t('inventory.detail.agingEstimate') : t('inventory.fields.peakMaturity')}
                  value={drinkingWindow}
                  valueColor="#B45309"
                />
              )}
              {d.serviceTemp && (
                <InfoCard
                  icon={<ThermostatIcon />}
                  label={isCigar ? t('inventory.fields.serviceTemp') + ' garde' : t('inventory.fields.serviceTemp')}
                  value={d.serviceTemp}
                />
              )}
              {isCigar && d.recommendedHumidity != null && (
                <InfoCard
                  icon={<WaterDropIcon />}
                  label={t('inventory.fields.recommendedHumidity')}
                  value={`${d.recommendedHumidity}% HR`}
                />
              )}
              {cellarName && (
                <InfoCard
                  icon={<PlaceIcon />}
                  label={t('inventory.detail.location')}
                  value={d.location ? `${cellarName} · ${d.location}` : cellarName}
                  valueColor="#7B1E30"
                />
              )}
            </Box>

            {/* Cigar vitole section */}
            {isCigar && (d.format || d.quantity) && (
              <>
                <Typography
                  sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '.1rem', textTransform: 'uppercase', color: 'text.secondary', mb: 1.5 }}
                >
                  {t('inventory.detail.vitole')}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, mb: 2.5 }}>
                  {d.format && (
                    <Box sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                      <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', display: 'block', mb: 0.25 }}>
                        {t('inventory.fields.format')}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{d.format}</Typography>
                    </Box>
                  )}
                  {d.quantity != null && (
                    <Box sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                      <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', display: 'block', mb: 0.25 }}>
                        {t('inventory.fields.quantity')}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{d.quantity}</Typography>
                    </Box>
                  )}
                  {d.recommendedHumidity != null && (
                    <Box sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                      <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', color: 'text.secondary', display: 'block', mb: 0.25 }}>
                        {t('inventory.fields.recommendedHumidity')}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{d.recommendedHumidity}%</Typography>
                    </Box>
                  )}
                </Box>
              </>
            )}

            {/* Notes */}
            {d.notes && (
              <>
                <Typography
                  sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '.1rem', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}
                >
                  {isCigar ? t('inventory.detail.tastingNotes') : t('inventory.detail.sommelierNotes')}
                </Typography>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'action.hover',
                    borderRadius: 2,
                    mb: 2.5,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary', fontStyle: 'italic', lineHeight: 1.6 }}>
                    {d.notes}
                  </Typography>
                </Box>
              </>
            )}

            {/* Collections */}
            {d.collections && d.collections.length > 0 && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                  <CollectionsBookmarkIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '.1rem', textTransform: 'uppercase', color: 'text.secondary' }}>
                    {t('collections.title')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2.5 }}>
                  {d.collections.map((col) => (
                    <Chip
                      key={col.id}
                      label={`${col.icon ? col.icon + ' ' : ''}${col.name}`}
                      size="small"
                      sx={{
                        bgcolor: `${col.color}22`,
                        borderColor: col.color,
                        color: col.color,
                        border: '1px solid',
                      }}
                    />
                  ))}
                </Box>
              </>
            )}

            {/* History */}
            {history && history.length > 0 && (
              <>
                <Typography
                  sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '.1rem', textTransform: 'uppercase', color: 'text.secondary', mb: 1.25 }}
                >
                  {t('traceability.title')}
                </Typography>
                <Box sx={{ mb: 3 }}>
                  {history.slice(0, 10).map((entry) => (
                    <Box
                      key={entry.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        py: 0.75,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:last-child': { borderBottom: 'none' },
                      }}
                    >
                      <Box
                        sx={{
                          px: 1,
                          py: 0.25,
                          borderRadius: 1.5,
                          bgcolor: 'primary.main',
                          color: '#fff',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          maxWidth: 80,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.actorName}
                      </Box>
                      <Typography variant="caption" sx={{ flex: 1, color: 'text.secondary', fontSize: '0.7rem' }}>
                        {formatHistoryEntry(entry)}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, fontSize: '0.65rem' }}>
                        {hasMounted ? new Date(entry.createdAt).toLocaleDateString() : ''}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Box>
        </Box>

        {/* ── Footer ─────────────────────────────────────────── */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
          }}
        >
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<LocalBarIcon />}
            onClick={() => setTastingOpen(true)}
            size="small"
          >
            {t('tastings.logTasting')}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => { onClose(); onEdit(item); }}
            size="small"
          >
            {t('actions.edit')}
          </Button>
        </Box>
      </Drawer>

      <TastingForm
        open={tastingOpen}
        onClose={() => setTastingOpen(false)}
        initialItemId={item.id}
      />
    </>
  );
}
