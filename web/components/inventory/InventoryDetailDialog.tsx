'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useCellars } from '@/hooks/useCellars';
import { useInventoryItem, useInventoryItemHistory, useUpdateInventoryItem } from '@/hooks/useInventory';
import { Button, Chip, Divider, Slider, Tooltip } from '@heroui/react';
import {
  X, Pencil, Flame, Thermometer, MapPin, Droplets,
  Wine, BookMarked, Dumbbell, Leaf, Sparkles, QrCode,
} from 'lucide-react';
import { InventoryItem, InventoryCategory, InventoryHistoryEntry } from '@/lib/inventory/types';
import { TastingForm } from '@/components/tastings/TastingForm';
import { TastingStatsSummary } from '@/components/tastings/TastingStatsSummary';
import { QrCodeModal } from './QrCodeModal';

const PLACEHOLDER_BG: Record<InventoryCategory, string> = {
  wine: 'linear-gradient(160deg, #3D1A1A 0%, #6B2C2C 100%)',
  sparkling: 'linear-gradient(160deg, #1A2A3D 0%, #2C4A6B 100%)',
  spirit: 'linear-gradient(160deg, #2D2010 0%, #5C4020 100%)',
  cigar: 'linear-gradient(160deg, #2A1A0A 0%, #5C3A1A 100%)',
};

const CATEGORY_ICONS_LG: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={64} className="opacity-20 text-white" />,
  sparkling: <Sparkles size={64} className="opacity-20 text-white" />,
  spirit: <Dumbbell size={64} className="opacity-20 text-white" />,
  cigar: <Leaf size={64} className="opacity-20 text-white" />,
};

interface InfoCardProps {
  icon: React.ReactElement;
  label: string;
  value: React.ReactNode;
  valueColor?: string;
}

function InfoCard({ icon, label, value, valueColor }: InfoCardProps) {
  return (
    <div className="p-3 border border-divider rounded-xl flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {React.cloneElement(icon, { size: 13, className: 'text-default-400 shrink-0' })}
        <span className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400">{label}</span>
      </div>
      <span
        className="text-[0.85rem] font-bold leading-tight"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

interface InventoryDetailDialogProps {
  item: InventoryItem | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (item: InventoryItem) => void;
  t?: (key: string) => string;
}

export function InventoryDetailDialog({ item, open, onClose, onEdit }: InventoryDetailDialogProps) {
  const { t } = useTranslation();
  const hasMounted = useHasMounted();
  const { data: cellars } = useCellars();
  const updateMutation = useUpdateInventoryItem();
  const [tastingOpen, setTastingOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

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

  if (!item || !d) return null;

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

  const fullLabel = t('inventory.detail.full');
  const halfLabel = t('inventory.detail.half');
  const emptyLabel = t('inventory.detail.empty');

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
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />

          {/* Drawer panel */}
          <div className="relative w-full sm:w-[400px] h-full bg-content1 flex flex-col overflow-hidden shadow-xl">
            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-divider shrink-0">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-secondary mb-0.5">
                {isCigar ? t('inventory.detail.titleCigar') : t('inventory.detail.titleWine')}
              </p>
              <div className="flex justify-between items-start">
                <h2 className="text-lg font-bold leading-tight pr-8">{d.name}</h2>
                <div className="flex items-center gap-1">
                  <Tooltip content={t('qr.title')} size="sm" placement="bottom">
                    <button
                      onClick={() => setQrOpen(true)}
                      className="shrink-0 p-1 rounded-lg hover:bg-default-100 transition-colors"
                      aria-label={t('qr.title')}
                    >
                      <QrCode size={16} />
                    </button>
                  </Tooltip>
                  <button
                    onClick={onClose}
                    className="shrink-0 p-1 rounded-lg hover:bg-default-100 transition-colors"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Fill level section */}
              <div className="px-5 pt-5">
                <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-3 text-center">
                  {sectionLabel}
                </p>

                {/* Image + fill badge */}
                <div
                  className="relative h-40 rounded-xl overflow-hidden mb-3 flex items-center justify-center border border-divider"
                  style={d.photoUrl ? undefined : { background: PLACEHOLDER_BG[d.category] }}
                >
                  {d.photoUrl ? (
                    <img src={d.photoUrl} alt={d.name} className="max-h-full max-w-full object-contain" />
                  ) : (
                    CATEGORY_ICONS_LG[d.category]
                  )}
                  <div
                    className={`absolute top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-lg text-xs font-extrabold text-white whitespace-nowrap tracking-wide ${localFill <= 20 ? 'bg-danger' : 'bg-[#111]'}`}
                  >
                    {localFill}%
                  </div>
                </div>

                {/* Slider */}
                <div className="mb-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-default-500">
                      {isCigar ? t('inventory.detail.levelCigar') : t('inventory.detail.levelWine')}
                    </span>
                    <span className="text-sm text-primary font-bold">{localFill}%</span>
                  </div>
                  <Slider
                    value={localFill}
                    onChange={(v) => setLocalFill(v as number)}
                    onChangeEnd={(v) => handleFillCommit(v as number)}
                    minValue={0}
                    maxValue={100}
                    step={1}
                    color="primary"
                    size="sm"
                    isDisabled={updateMutation.isPending}
                    className="py-2"
                  />
                  <div className="flex justify-between -mt-1">
                    <span className="text-[0.65rem] text-default-400">{t('inventory.detail.empty')} (0%)</span>
                    <span className="text-[0.65rem] text-default-400">
                      {isCigar ? t('inventory.detail.inUse') : t('inventory.detail.opened')}
                    </span>
                    <span className="text-[0.65rem] text-default-400">{fullLabel} (100%)</span>
                  </div>
                </div>

                {/* Preset buttons */}
                <div className="flex gap-2 mt-3">
                  {[
                    { label: fullLabel, value: 100 },
                    { label: halfLabel, value: 50 },
                    { label: emptyLabel, value: 0 },
                  ].map(({ label, value }) => (
                    <Button
                      key={value}
                      variant={localFill === value ? 'solid' : 'bordered'}
                      color={localFill === value ? 'primary' : 'default'}
                      size="sm"
                      onPress={() => handlePreset(value)}
                      isDisabled={updateMutation.isPending}
                      className="flex-1 text-xs py-3"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <Divider className="my-5" />

              {/* Info cards grid */}
              <div className="px-5">
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {drinkingWindow && (
                    <InfoCard
                      icon={<Flame />}
                      label={isCigar ? t('inventory.detail.agingEstimate') : t('inventory.fields.peakMaturity')}
                      value={drinkingWindow}
                      valueColor="#B45309"
                    />
                  )}
                  {d.serviceTemp && (
                    <InfoCard
                      icon={<Thermometer />}
                      label={isCigar ? t('inventory.fields.serviceTemp') + ' garde' : t('inventory.fields.serviceTemp')}
                      value={d.serviceTemp}
                    />
                  )}
                  {isCigar && d.recommendedHumidity != null && (
                    <InfoCard
                      icon={<Droplets />}
                      label={t('inventory.fields.recommendedHumidity')}
                      value={`${d.recommendedHumidity}% HR`}
                    />
                  )}
                  {cellarName && (
                    <InfoCard
                      icon={<MapPin />}
                      label={t('inventory.detail.location')}
                      value={d.location ? `${cellarName} · ${d.location}` : cellarName}
                      valueColor="#7B1E30"
                    />
                  )}
                </div>

                {/* Cigar vitole section */}
                {isCigar && (d.format || d.quantity) && (
                  <>
                    <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-3">
                      {t('inventory.detail.vitole')}
                    </p>
                    <div className="grid grid-cols-3 gap-2 mb-5">
                      {d.format && (
                        <div className="p-2 border border-divider rounded-xl">
                          <span className="text-[0.55rem] font-bold uppercase text-default-400 block mb-0.5">
                            {t('inventory.fields.format')}
                          </span>
                          <span className="text-[0.8rem] font-bold">{d.format}</span>
                        </div>
                      )}
                      {d.quantity != null && (
                        <div className="p-2 border border-divider rounded-xl">
                          <span className="text-[0.55rem] font-bold uppercase text-default-400 block mb-0.5">
                            {t('inventory.fields.quantity')}
                          </span>
                          <span className="text-[0.8rem] font-bold">{d.quantity}</span>
                        </div>
                      )}
                      {d.recommendedHumidity != null && (
                        <div className="p-2 border border-divider rounded-xl">
                          <span className="text-[0.55rem] font-bold uppercase text-default-400 block mb-0.5">
                            {t('inventory.fields.recommendedHumidity')}
                          </span>
                          <span className="text-[0.8rem] font-bold">{d.recommendedHumidity}%</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Notes */}
                {d.notes && (
                  <>
                    <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
                      {isCigar ? t('inventory.detail.tastingNotes') : t('inventory.detail.sommelierNotes')}
                    </p>
                    <div className="p-3 bg-default-50 rounded-xl mb-5 border border-divider">
                      <p className="text-sm text-default-500 italic leading-relaxed whitespace-pre-wrap">
                        {d.notes}
                      </p>
                    </div>
                  </>
                )}

                {/* Collections */}
                {d.collections && d.collections.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 mb-2">
                      <BookMarked size={13} className="text-default-400" />
                      <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400">
                        {t('collections.title')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {d.collections.map((col) => (
                        <Chip
                          key={col.id}
                          size="sm"
                          variant="bordered"
                          style={{
                            backgroundColor: `${col.color}22`,
                            borderColor: col.color,
                            color: col.color,
                          }}
                        >
                          {col.icon ? `${col.icon} ` : ''}{col.name}
                        </Chip>
                      ))}
                    </div>
                  </>
                )}

                {/* Tasting stats (FEAT-79) */}
                <>
                  <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-2">
                    {t('tastings.title')}
                  </p>
                  <div className="mb-5">
                    <TastingStatsSummary
                      itemId={item.id}
                      onViewAll={() => setTastingOpen(true)}
                    />
                  </div>
                </>

                {/* History */}
                {history && history.length > 0 && (
                  <>
                    <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400 mb-3">
                      {t('traceability.title')}
                    </p>
                    <div className="mb-6">
                      {history.slice(0, 10).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-2 py-2 border-b border-divider last:border-b-0"
                        >
                          <span className="px-2 py-0.5 rounded-md bg-primary text-white text-[0.65rem] font-bold shrink-0 max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {entry.actorName}
                          </span>
                          <span className="flex-1 text-[0.7rem] text-default-500">
                            {formatHistoryEntry(entry)}
                          </span>
                          <span className="shrink-0 text-[0.65rem] text-default-300">
                            {hasMounted ? new Date(entry.createdAt).toLocaleDateString() : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-divider flex gap-2 shrink-0">
              <Button
                variant="bordered"
                color="secondary"
                startContent={<Wine size={15} />}
                onPress={() => setTastingOpen(true)}
                size="sm"
              >
                {t('tastings.logTasting')}
              </Button>
              <div className="flex-1" />
              {onEdit && (
                <Button
                  color="primary"
                  startContent={<Pencil size={15} />}
                  onPress={() => { onClose(); onEdit(item); }}
                  size="sm"
                >
                  {t('actions.edit')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <TastingForm
        open={tastingOpen}
        onClose={() => setTastingOpen(false)}
        initialItemId={item.id}
      />

      <QrCodeModal
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        itemId={item.id}
        itemName={item.name}
      />
    </>
  );
}
