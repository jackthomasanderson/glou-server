'use client';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Drawer, DrawerContent, Spinner, Tooltip } from '@heroui/react';
import {
  X, Pencil, Flame, Thermometer, Droplets, Wine, BookMarked, GlassWater, Leaf, Sparkles, QrCode,
  TrendingUp, Bell, BellOff, Star, Grape,
} from 'lucide-react';
import { isIntactItem, unitKind } from '@shared/units';
import { useCellars } from '@/hooks/useCellars';
import { productDetailKey, useProductDetail } from '@/hooks/useProducts';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateInventoryItem } from '@/hooks/useInventory';
import { useToggleAlertPause } from '@/hooks/useAlerts';
import { useHasMounted } from '@/hooks/useHasMounted';
import { CurveGlyph } from '@/components/ui/CurveGlyph';
import { CollectionPickerInline } from '@/components/collections/CollectionPickerInline';
import { TastingForm } from '@/components/tastings/TastingForm';
import { ErrorState } from '@/components/ui/ErrorState';
import { DEFAULT_CURVE_SHAPE, curveShapeDescriptionKey, curveShapeLabelKey } from '@/lib/maturity-references/curve';
import { getCategoryPlaceholderGradient } from '@/lib/analytics/categoryColors';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { notifySuccess } from '@/lib/toast';
import { describeStock, keepNumbersWhole, wineName } from '@/lib/products/stock';
import { bottleLabel, familyLines, type LineContext } from '@/lib/products/lines';
import type { InventoryCategory } from '@/lib/inventory/types';
import type { ProductDetailView, ProductItem } from '@/lib/products/types';
import { QrCodeModal } from './QrCodeModal';
import { formatHistoryValue, historyFieldLabel } from '@/lib/inventory/history-format';
import { FieldSourceBadge } from './FieldSourceBadge';
import { FamilyStockLines } from './FamilyStockLines';
import { FamilyHistory } from './FamilyHistory';
import { StockLineMenu } from './StockLineMenu';
import { unitNoun } from '@/lib/products/stockActions';

const CATEGORY_ICONS_LG: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={64} className="opacity-20 text-white" />,
  sparkling: <Sparkles size={64} className="opacity-20 text-white" />,
  spirit: <GlassWater size={64} className="opacity-20 text-white" />,
  cigar: <Leaf size={64} className="opacity-20 text-white" />,
};

function InfoCard({ icon, label, value, valueClassName }: {
  icon: React.ReactElement;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="p-3 border border-divider rounded-xl flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {React.cloneElement(icon as React.ReactElement<{ size?: number; className?: string }>, { size: 13, className: 'text-foreground-500 shrink-0' })}
        <span className="text-xs font-bold uppercase tracking-widest text-foreground-500">{label}</span>
      </div>
      <span className={`text-sm font-bold leading-tight ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}

/**
 * §10.3 block 4: the rest of the wine's description and technical sheet,
 * shown when filled (a value of the wine, true of all its bottles).
 */
const SHEET_FIELDS = [
  'region', 'appellation', 'classification', 'color', 'alcoholDegree', 'needsAeration',
  'sparklingType', 'sugarLevel', 'baseYear', 'disgorgingDate',
  'spiritType', 'edition', 'declaredAge', 'caskType', 'caskNumber', 'caskProof', 'isSingleCask',
  'aromaticProfile', 'additions',
  'leafOrigin', 'factoryCode', 'manufactureYear', 'humidificationSystem',
  'lotNumber', 'batchDate',
] as const satisfies readonly (keyof ProductDetailView)[];

/** Values of a list (colour, sparkling type, sugar) read in words. */
const LISTED_VALUES: Partial<Record<(typeof SHEET_FIELDS)[number], string>> = {
  color: 'inventory.color', sparklingType: 'inventory.sparklingTypes', sugarLevel: 'inventory.sugarLevels',
};

const READINESS_COLOR = { TOO_YOUNG: 'default', PERFECT: 'success', PEAK: 'warning', PAST: 'danger' } as const;

/** Average of the rated tastings, null when none is rated. */
function averageRating(tastings: ProductDetailView['tastings']): number | null {
  const ratings = tastings.map((tasting) => tasting.rating).filter((rating): rating is number => rating != null);
  return ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null;
}

const SectionTitle = ({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) => (
  <div className="flex items-center gap-1.5 mb-2">
    {icon}
    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-500">{children}</h3>
  </div>
);

export interface FamilyDrawerProps {
  /** The wine (family) shown; null keeps the drawer closed. */
  productId: string | null;
  onClose: () => void;
  /** "Modifier": the wine's description, for all its bottles. */
  onEdit?: (product: ProductDetailView) => void;
  /**
   * Anchors for the actions of the next lots: the menu of a line (by
   * default {@link StockLineMenu}: "Déplacer", "Corriger le nombre"…) and the
   * footer's main action (L1: "J'en ouvre une", "Ajouter des bouteilles").
   */
  lineActions?: (item: ProductItem, product: ProductDetailView) => React.ReactNode;
  primaryAction?: (product: ProductDetailView) => React.ReactNode;
}

/**
 * The drawer of a wine (ux-ui.md §10.3, #471): its stock line by line, the
 * bottles already drunk or gone, its shared description, its tastings and
 * its history. Opens for any wine, one known without any bottle included.
 * The state of a group of bottles is never set from here: only the level
 * of a bottle already opened (a single copy, nothing detached).
 */
export function FamilyDrawer({ productId, onClose, onEdit, lineActions, primaryAction }: FamilyDrawerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const hasMounted = useHasMounted();
  const { data: product, isLoading, isError, refetch, isRefetching } = useProductDetail(productId);
  const { data: cellars } = useCellars();
  const updateItem = useUpdateInventoryItem();
  const queryClient = useQueryClient();
  const togglePause = useToggleAlertPause();
  const [tastingOpen, setTastingOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const cellarName = useCallback((id: string) => cellars?.find((cellar) => cellar.id === id)?.name, [cellars]);
  const kind = unitKind(product?.category ?? 'wine');
  const ctx: LineContext = useMemo(() => ({
    kind,
    t,
    cellarName,
    formatPrice: (value) => formatCurrency(value, lang),
    formatMonth: (day) => formatDate(day, lang, { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    formatDate: (iso) => formatDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' }),
  }), [kind, t, cellarName, lang]);
  const lines = useMemo(() => familyLines(product?.items ?? [], cellarName), [product?.items, cellarName]);

  // One opened bottle: its own level, no copy detached. Put back full, it
  // rejoins its group (K): the answer is then that group.
  // The version sent is read from the cache when the level is sent: a level
  // chosen while the previous one was saving goes after it, from its answer.
  const handleLevel = useCallback(async (item: ProductItem, level: number) => {
    const current = queryClient.getQueryData<ProductDetailView>(productDetailKey(item.productId))
      ?.items.find((unit) => unit.id === item.id) ?? item;
    const saved = await updateItem.mutateAsync({
      id: item.id,
      patch: level >= 100 ? { fillLevel: 100, isOpened: false } : { fillLevel: level },
      expectedUpdatedAt: current.updatedAt as string,
    });
    if (saved.id !== item.id) notifySuccess('familyDrawer.lines.reattached');
  }, [updateItem, queryClient]);

  const isOpen = productId !== null;
  // A copy in stock, for the alert pause (it acts on the wine, through any of its bottles).
  const unitInStock = lines.inCellar[0];
  // A tasting is preset on the opened bottle, the one being drunk; else on the
  // only line in the cellar (no question when the answer is obvious, §10.4).
  // Several lines and none opened: the member picks the bottle — never a full
  // one chosen for them, which a "Bue" answer would then detach.
  const tastingPreset = lines.inCellar.find((item) => !isIntactItem(item))
    ?? (lines.inCellar.length === 1 ? lines.inCellar[0] : undefined);

  const renderBody = (p: ProductDetailView) => {
    const stock = describeStock(p, t);
    const stockText = stock.parts.length > 0 ? stock.parts.join(' · ') : stock.spoken;
    const isCigar = p.category === 'cigar';
    const isWineOrSparkling = p.category === 'wine' || p.category === 'sparkling';
    const drinkingWindow = p.peakMaturityFrom && p.peakMaturityTo
      ? `${p.peakMaturityFrom} – ${p.peakMaturityTo}`
      : p.peakMaturityFrom ? `≥ ${p.peakMaturityFrom}` : p.peakMaturityTo ? `≤ ${p.peakMaturityTo}` : null;
    const curveShape = p.curveShape ?? DEFAULT_CURVE_SHAPE;
    const curveSource = p.lockedFields.includes('curveShape')
      ? t('maturity.curveSource.manual')
      : p.curveShape ? t('maturity.curveSource.reference') : t('maturity.curveSource.default');

    return (
      <div className="flex flex-col gap-6 px-5 py-5">
        {/* 1. Photo, stock and value */}
        <div>
          <div
            className="relative h-40 rounded-xl overflow-hidden mb-3 flex items-center justify-center border border-divider"
            style={p.photoUrl ? undefined : { background: getCategoryPlaceholderGradient(p.category) }}
          >
            {p.photoUrl
              ? <img loading="lazy" decoding="async" src={p.photoUrl} alt={p.name} className="max-h-full max-w-full object-contain" />
              : CATEGORY_ICONS_LG[p.category]}
          </div>
          <p className="text-sm font-semibold" data-testid="family-drawer-stock" aria-label={[wineName(p), stock.spoken].join(', ')}>
            {keepNumbersWhole(stockText)}
            {stock.value > 0 && <span className="text-foreground-500 font-normal"> · {t('familyDrawer.value', { value: formatCurrency(stock.value, lang) })}</span>}
          </p>
        </div>

        {/* 2-3. Bottles in the cellar, then those already drunk or gone */}
        <FamilyStockLines
          lines={lines}
          ctx={ctx}
          onLevelCommit={handleLevel}
          lineActions={(item) => (lineActions ? lineActions(item, p) : <StockLineMenu item={item} ctx={ctx} />)}
        />

        {/* 4. The wine's description, shared by all its bottles */}
        <section>
          <SectionTitle>{t(isCigar ? 'familyDrawer.description.titleCigar' : 'familyDrawer.description.title')}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {drinkingWindow && (
              <InfoCard
                icon={<Flame />}
                label={isCigar ? t('inventory.detail.agingEstimate') : t('inventory.fields.peakMaturity')}
                value={drinkingWindow}
                valueClassName="text-warning-700 dark:text-warning"
              />
            )}
            {isWineOrSparkling && drinkingWindow && (
              <InfoCard
                icon={<TrendingUp />}
                label={t('inventory.fields.curveShape')}
                value={
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      <CurveGlyph shape={curveShape} width={32} className="text-primary shrink-0" />
                      {t(curveShapeLabelKey(curveShape))}
                      {p.readiness != null && <span className="text-primary">· {p.readiness}%</span>}
                    </span>
                    <span className="text-xs font-normal text-foreground-500">
                      {t(curveShapeDescriptionKey(curveShape))} — {curveSource}
                    </span>
                  </span>
                }
              />
            )}
            {p.grapeVarieties.length > 0 && (
              <InfoCard icon={<Grape />} label={t('inventory.fields.grapeVarieties')} value={p.grapeVarieties.join(', ')} />
            )}
            {p.serviceTemp && (
              <InfoCard
                icon={<Thermometer />}
                label={isCigar ? t('inventory.fields.storageTemp') : t('inventory.fields.serviceTemp')}
                value={p.serviceTemp}
              />
            )}
            {isCigar && p.recommendedHumidity != null && (
              <InfoCard
                icon={<Droplets />}
                label={t('inventory.fields.recommendedHumidity')}
                value={t('inventory.detail.humidityValue', { value: p.recommendedHumidity })}
              />
            )}
            {isCigar && p.format && <InfoCard icon={<Leaf />} label={t('inventory.fields.format')} value={p.format} />}
          </div>

          {(() => {
            const filled = SHEET_FIELDS.filter((field) => p[field] != null && p[field] !== '');
            if (filled.length === 0) return null;
            return (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mt-3 text-sm" data-testid="family-sheet">
                {filled.map((field) => (
                  <React.Fragment key={field}>
                    <dt className="text-foreground-500">{historyFieldLabel(field, t)}</dt>
                    <dd className="flex items-center gap-1.5 flex-wrap font-medium">
                      {LISTED_VALUES[field]
                        ? t(`${LISTED_VALUES[field]}.${String(p[field])}`)
                        : typeof p[field] === 'number'
                          ? formatNumber(p[field] as number, lang)
                          : formatHistoryValue(field, p[field], t, { lang })}
                      <FieldSourceBadge source={p.fieldSources?.[field]} t={t} />
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            );
          })()}

          {/* #506: the pause can be undone here, as the bell hides paused alerts. */}
          {drinkingWindow && unitInStock && (
            <div className="flex items-center justify-between gap-2 mt-3">
              <span className="text-xs text-foreground-500">{p.alertsPaused ? t('alerts.paused') : t('alerts.title')}</span>
              <Button
                size="sm"
                variant="bordered"
                color={p.alertsPaused ? 'primary' : 'default'}
                startContent={p.alertsPaused ? <Bell size={14} /> : <BellOff size={14} />}
                onPress={() => togglePause.mutate(unitInStock.id)}
                isLoading={togglePause.isPending}
              >
                {p.alertsPaused ? t('alerts.resumeAlert') : t('alerts.pauseAlert')}
              </Button>
            </div>
          )}

          {p.notes && (
            <div className="p-3 bg-default-50 rounded-xl mt-3 border border-divider">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-foreground-500 mb-1">
                {isCigar ? t('inventory.detail.tastingNotes') : t('inventory.detail.sommelierNotes')}
                <FieldSourceBadge source={p.fieldSources?.notes} t={t} />
              </p>
              <p className="text-sm text-foreground-500 italic leading-relaxed whitespace-pre-wrap">{p.notes}</p>
            </div>
          )}

          <div className="mt-3">
            <SectionTitle icon={<BookMarked size={13} className="text-foreground-500" />}>{t('collections.title')}</SectionTitle>
            <CollectionPickerInline productId={p.id} currentCollections={p.collections} />
          </div>
        </section>

        {/* 5. Every tasting of the wine, with the bottle when known */}
        <section>
          <SectionTitle>{t('familyDrawer.tastings.title')}</SectionTitle>
          {/* FEAT-79, now over every tasting of the wine. */}
          {averageRating(p.tastings) != null && (
            <p className="flex items-center gap-1 text-xs text-foreground-500 mb-2">
              {t('tastings.stats.avgRating')}
              <Star size={12} className="text-warning" fill="currentColor" aria-hidden />
              <span className="font-bold text-foreground">{formatNumber(averageRating(p.tastings) as number, lang, { maximumFractionDigits: 1 })}</span>
            </p>
          )}
          {p.tastings.length === 0 ? (
            <p className="text-sm text-foreground-500">{t('familyDrawer.tastings.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="family-tastings">
              {p.tastings.map((tasting) => {
                const bottle = tasting.itemId ? p.items.find((item) => item.id === tasting.itemId) : undefined;
                // "Garage · 20 € / bouteille": where the bottle tasted was, and its price.
                const which = bottle ? bottleLabel(bottle, ctx) : t('familyDrawer.tastings.elsewhere');
                return (
                  <li key={tasting.id} className="p-3 rounded-xl border border-divider">
                    <div className="flex items-center justify-between gap-2 text-xs text-foreground-500">
                      <span>{hasMounted ? ctx.formatDate(tasting.tastedAt as string) : ''} · {which}</span>
                      {tasting.rating != null && (
                        <span className="flex items-center gap-0.5 font-bold text-foreground">
                          <Star size={12} className="text-warning" aria-hidden /> {tasting.rating}
                        </span>
                      )}
                    </div>
                    {tasting.readiness && (
                      <Chip size="sm" variant="flat" color={READINESS_COLOR[tasting.readiness]} className="mt-1">
                        {t(`tastings.readiness.${tasting.readiness}`)}
                      </Chip>
                    )}
                    {tasting.notes && <p className="text-sm mt-1 line-clamp-3">{tasting.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 6. History of the wine and of its bottles */}
        <FamilyHistory
          productId={p.id}
          productUpdatedAt={p.updatedAt}
          history={p.history}
          itemIds={new Set(p.items.map((item) => item.id))}
          cellarName={cellarName}
          nounOf={(itemId) => unitNoun(p.items.find((item) => item.id === itemId) ?? { cigarsPerBox: null }, kind)}
        />
      </div>
    );
  };

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} placement="right" backdrop="opaque" hideCloseButton classNames={{ base: 'max-w-[440px] shadow-xl' }}>
        <DrawerContent>
          <>
            <div className="px-5 pt-5 pb-3 border-b border-divider shrink-0">
              <p className="text-xs font-bold uppercase tracking-widest text-secondary mb-0.5">
                {product ? t(`categories.${product.category}`) : ' '}
              </p>
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <h2 id="inventory-detail-title" className="text-lg font-bold leading-tight break-words">{product?.name ?? ''}</h2>
                  <FieldSourceBadge source={product?.fieldSources?.name} t={t} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {product && (
                    <Tooltip delay={500} content={t('qr.title')} size="sm" placement="bottom">
                      <button onClick={() => setQrOpen(true)} className="p-1 rounded-lg hover:bg-default-100 transition-colors" aria-label={t('qr.title')}>
                        <QrCode size={16} />
                      </button>
                    </Tooltip>
                  )}
                  <button onClick={onClose} className="p-1 rounded-lg hover:bg-default-100 transition-colors" aria-label={t('actions.close')}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              {product && (
                <p className="flex items-center gap-1.5 flex-wrap text-xs text-foreground-500 mt-1">
                  {(['producer', 'vintage', 'region'] as const)
                    .filter((field) => product[field] != null && product[field] !== '')
                    .map((field, index) => (
                      <React.Fragment key={field}>
                        {index > 0 && <span className="text-foreground-400">·</span>}
                        <span>{product[field]}</span>
                        <FieldSourceBadge source={product.fieldSources?.[field]} t={t} />
                      </React.Fragment>
                    ))}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="flex justify-center p-8" role="status" aria-live="polite">
                  <Spinner aria-label={t('status.loading')} />
                </div>
              )}
              {isError && (
                <div className="p-5">
                  <ErrorState message={t('familyDrawer.loadError')} onRetry={() => { void refetch(); }} isRetrying={isRefetching} />
                </div>
              )}
              {product && renderBody(product)}
            </div>

            {product && (
              <div className="px-5 py-3 border-t border-divider flex flex-wrap gap-2 shrink-0">
                {primaryAction?.(product)}
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
                  <Button color="primary" variant="bordered" startContent={<Pencil size={15} />} onPress={() => onEdit(product)} size="sm">
                    {t('actions.edit')}
                  </Button>
                )}
              </div>
            )}
          </>
        </DrawerContent>
      </Drawer>

      <TastingForm open={tastingOpen} onClose={() => setTastingOpen(false)} initialItemId={tastingPreset?.id} />

      {product && (
        <QrCodeModal isOpen={qrOpen} onClose={() => setQrOpen(false)} itemId={product.id} itemName={wineName(product)} />
      )}
    </>
  );
}
