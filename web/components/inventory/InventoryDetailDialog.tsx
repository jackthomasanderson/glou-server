'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useCellars } from '@/hooks/useCellars';
import { useInventoryItem, useInventoryItemHistory, useUpdateInventoryItem, useRollbackField } from '@/hooks/useInventory';
import { Button, Chip, Divider, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Slider, Tooltip } from '@heroui/react';
import {
  X, Pencil, Flame, Thermometer, MapPin, Droplets,
  Wine, BookMarked, Dumbbell, Leaf, Sparkles, QrCode, Euro,
  FileSpreadsheet, ScanLine, Wand2, History as HistoryIcon,
} from 'lucide-react';
import { InventoryItem, InventoryCategory, InventoryFieldChange, InventoryHistoryEntry, FieldSource } from '@/lib/inventory/types';
import { TastingForm } from '@/components/tastings/TastingForm';
import { TastingStatsSummary } from '@/components/tastings/TastingStatsSummary';
import { QrCodeModal } from './QrCodeModal';
import { CollectionPickerInline } from '@/components/collections/CollectionPickerInline';

import { getCategoryPlaceholderGradient } from '@/lib/analytics/categoryColors';

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

// ─── FEAT-05: Field source transparency ─────────────────────────────────────
// 'ocr' is active since FEAT-04 (scan) landed. 'enrichment' remains
// roadmap-only (no third-party lookup pipeline wired up yet) but the badge
// stays generic so it activates for free once a real enrichment source lands.
const SOURCE_ICONS: Record<Exclude<FieldSource, 'manual'>, React.ReactElement> = {
  import_csv: <FileSpreadsheet size={11} />,
  ocr: <ScanLine size={11} />,
  enrichment: <Wand2 size={11} />,
};

interface FieldSourceBadgeProps {
  source: FieldSource | undefined | null;
  t: (key: string) => string;
}

/** Renders nothing for the implicit 'manual' default — only non-manual sources are worth flagging. */
function FieldSourceBadge({ source, t }: FieldSourceBadgeProps) {
  if (!source || source === 'manual') return null;
  return (
    <Chip
      size="sm"
      variant="flat"
      color="default"
      radius="full"
      startContent={SOURCE_ICONS[source]}
      className="h-4 px-1.5 gap-1 text-[0.55rem] font-semibold shrink-0"
    >
      {t(`traceability.source.${source}`)}
    </Chip>
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
  const rollbackMutation = useRollbackField();
  const [tastingOpen, setTastingOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<InventoryFieldChange | null>(null);

  const { data: enrichedItem } = useInventoryItem(item?.id ?? '');
  const { data: history } = useInventoryItemHistory(item?.id ?? '', open);

  const d = enrichedItem ?? item;
  const fillLevel = d?.isOpened ? (d?.fillLevel ?? 0) : 100;
  const [localFill, setLocalFill] = useState(fillLevel);

  // localFill is a locally-editable copy of fillLevel (the slider below lets
  // the user drag it before it's saved) that needs to resync whenever the
  // underlying data or open item changes — adjusted during render (React's
  // documented pattern) rather than in an effect, guarded against the
  // previous render's values so it only resyncs on an actual change.
  const [prevSyncKey, setPrevSyncKey] = useState([d?.fillLevel, d?.isOpened, open]);
  if (d?.fillLevel !== prevSyncKey[0] || d?.isOpened !== prevSyncKey[1] || open !== prevSyncKey[2]) {
    setPrevSyncKey([d?.fillLevel, d?.isOpened, open]);
    setLocalFill(d?.isOpened ? (d?.fillLevel ?? 0) : 100);
  }

  // This drawer is hand-rolled rather than the shared HeroUI Modal, so
  // Escape-to-close and screen-reader dialog semantics aren't automatic —
  // added explicitly here instead of switching component to keep the
  // existing layout/behavior otherwise unchanged.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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
  const fieldSources = d.fieldSources ?? {};

  const handleRollbackConfirm = () => {
    if (!rollbackTarget) return;
    rollbackMutation.mutate(
      { id: item.id, field: rollbackTarget.field, toValue: rollbackTarget.from },
      { onSuccess: () => setRollbackTarget(null) }
    );
  };

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

  const fieldLabel = (field: string): string => t(`inventory.fields.${field}`, { defaultValue: field });

  const formatHistoryEntry = (entry: InventoryHistoryEntry): string => {
    if (!entry.changes || entry.changes.length === 0) {
      return t(`traceability.actions.${entry.action.toLowerCase()}`);
    }
    if (entry.action === 'RESTORE_FIELD' && entry.changes.length === 1) {
      return t('traceability.restoredField', { field: fieldLabel(entry.changes[0].field) });
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
          <div
            className="relative w-full sm:w-[400px] h-full bg-content1 flex flex-col overflow-hidden shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-detail-title"
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-3 border-b border-divider shrink-0">
              <p className="text-[0.6rem] font-bold uppercase tracking-widest text-secondary mb-0.5">
                {/* Was wine/cigar binary (t('inventory.detail.titleWine') for
                    "everything that isn't a cigar"), which mislabeled
                    sparkling/spirit items as "Bottle details" too narrowly
                    when they're not wine either. titleCigar's copy ("Asset
                    details") is already category-neutral — use it for all
                    four categories instead of branching. */}
                {t('inventory.detail.titleCigar')}
              </p>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5 flex-wrap pr-8">
                  <h2 id="inventory-detail-title" className="text-lg font-bold leading-tight">{d.name}</h2>
                  <FieldSourceBadge source={fieldSources.name} t={t} />
                </div>
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
                    aria-label={t('actions.close')}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Producer / vintage / region — most visible fields, tagged with their source (FEAT-05) */}
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className="text-xs text-default-500">{d.producer}</span>
                <FieldSourceBadge source={fieldSources.producer} t={t} />
                {d.vintage != null && (
                  <>
                    <span className="text-default-300">·</span>
                    <span className="text-xs text-default-500">{d.vintage}</span>
                    <FieldSourceBadge source={fieldSources.vintage} t={t} />
                  </>
                )}
                {d.region && (
                  <>
                    <span className="text-default-300">·</span>
                    <span className="text-xs text-default-500">{d.region}</span>
                    <FieldSourceBadge source={fieldSources.region} t={t} />
                  </>
                )}
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
                  style={d.photoUrl ? undefined : { background: getCategoryPlaceholderGradient(d.category) }}
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
                    aria-label={isCigar ? t('inventory.detail.levelCigar') : t('inventory.detail.levelWine')}
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
                  {(cellarName || d.location) && (
                    <InfoCard
                      icon={<MapPin />}
                      label={t('inventory.detail.location')}
                      value={[cellarName, d.location].filter(Boolean).join(' › ')}
                      valueColor="#7B1E30"
                    />
                  )}
                  {d.purchasePrice != null && (
                    <InfoCard
                      icon={<Euro />}
                      label={t('inventory.fields.purchasePrice')}
                      value={
                        <span className="flex items-center gap-1.5">
                          {d.purchasePrice} €
                          <FieldSourceBadge source={fieldSources.purchasePrice} t={t} />
                        </span>
                      }
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
                    <div className="flex items-center gap-1.5 mb-2">
                      <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400">
                        {isCigar ? t('inventory.detail.tastingNotes') : t('inventory.detail.sommelierNotes')}
                      </p>
                      <FieldSourceBadge source={fieldSources.notes} t={t} />
                    </div>
                    <div className="p-3 bg-default-50 rounded-xl mb-5 border border-divider">
                      <p className="text-sm text-default-500 italic leading-relaxed whitespace-pre-wrap">
                        {d.notes}
                      </p>
                    </div>
                  </>
                )}

                {/* Collections — editable inline */}
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookMarked size={13} className="text-default-400" />
                    <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400">
                      {t('collections.title')}
                    </p>
                  </div>
                  <div className="mb-5">
                    <CollectionPickerInline
                      itemId={d.id}
                      currentCollections={d.collections ?? []}
                    />
                  </div>
                </>

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
                    <div className="flex items-center gap-1.5 mb-3">
                      <HistoryIcon size={13} className="text-default-400" />
                      <p className="text-[0.6rem] font-bold uppercase tracking-widest text-default-400">
                        {t('traceability.title')}
                      </p>
                    </div>
                    <div className="mb-6">
                      {history.slice(0, 10).map((entry) => {
                        // fillLevel already has a dedicated restore control (the slider +
                        // preset buttons above) — repeating a rollback button per adjustment
                        // here would just be noise on what's typically the most frequent
                        // change type.
                        const restorableChanges = (entry.changes ?? []).filter((c) => c.field !== 'fillLevel');
                        return (
                          <div key={entry.id} className="py-2 border-b border-divider last:border-b-0">
                            <div className="flex items-center gap-2">
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
                            {restorableChanges.length > 0 && (
                              <div className="mt-1 pl-1 flex flex-col gap-0.5">
                                {restorableChanges.map((change, idx) => (
                                  <div
                                    key={`${entry.id}-${change.field}-${idx}`}
                                    className="flex items-center justify-between gap-2"
                                  >
                                    <span className="text-[0.6rem] text-default-400 truncate">
                                      {fieldLabel(change.field)}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="light"
                                      color="primary"
                                      className="h-5 min-w-0 px-1.5 text-[0.6rem] shrink-0"
                                      onPress={() => setRollbackTarget(change)}
                                    >
                                      {t('traceability.restoreValue')}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
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

      {/* Rollback confirmation (FEAT-05) — data-modifying action, requires confirmation */}
      <Modal
        isOpen={rollbackTarget !== null}
        onClose={() => { setRollbackTarget(null); rollbackMutation.reset(); }}
        size="sm"
        radius="lg"
        backdrop="opaque"
        placement="center"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center gap-2 pb-1">
                <HistoryIcon size={16} className="text-primary shrink-0" />
                <span>{t('traceability.restoreConfirm.title')}</span>
              </ModalHeader>
              <ModalBody className="py-2">
                <p className="text-sm text-default-500">
                  {rollbackTarget &&
                    t('traceability.restoreConfirm.body', {
                      field: fieldLabel(rollbackTarget.field),
                      value: formatHistoryValue(rollbackTarget.from, t),
                    })}
                </p>
                {rollbackMutation.isError && (
                  <p className="text-xs text-danger">{t('traceability.restoreError')}</p>
                )}
              </ModalBody>
              <ModalFooter className="flex gap-2 px-4 pb-4 pt-2">
                <Button
                  color="danger"
                  variant="light"
                  onPress={() => { setRollbackTarget(null); rollbackMutation.reset(); }}
                  isDisabled={rollbackMutation.isPending}
                  className="flex-1"
                >
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  onPress={handleRollbackConfirm}
                  isLoading={rollbackMutation.isPending}
                  className="flex-1"
                >
                  {t('traceability.restoreConfirm.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

/** Human-readable rendering of a raw historical field value inside the rollback confirmation copy. */
function formatHistoryValue(value: unknown, t: (key: string) => string): string {
  if (value === null || value === undefined || value === '') return t('actions.none');
  if (typeof value === 'boolean') return value ? t('traceability.booleanTrue') : t('traceability.booleanFalse');
  return String(value);
}
