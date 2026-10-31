'use client';
import React, { useState, useEffect } from 'react';
import {
  ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Divider, Input, Select, SelectItem,
} from '@heroui/react';
import i18n from '@/lib/i18n';
import { currencySymbol, todayLocalIso } from '@/lib/format';
import { CATEGORY_CHIP_COLOR } from '@/lib/analytics/categoryColors';
import { FilterChip } from '@/components/ui/FilterControls';
import { notifyError } from '@/lib/toast';
import { X, Save, Sparkles, ChevronDown, ChevronUp, Wine, Leaf, Camera, FlaskConical, GlassWater } from 'lucide-react';
import { InventoryItem, InventoryCategory, CATEGORY_VALUES } from '@/lib/inventory/types';
import type { UnitKind } from '@shared/units';
import { useCellars } from '@/hooks/useCellars';
import { useCollections } from '@/hooks/useCollections';
import { Collection } from '@/lib/collections/types';
import { ProductAutocomplete } from './ProductAutocomplete';
import { ProductSuggestion } from '@/lib/inventory/productSearch';
import { ProducerAutocomplete } from './ProducerAutocomplete';
import { ImageResult } from './ImagePicker';
import { ItemImageSection } from './ItemImageSection';
import { MaturitySuggestionField } from './MaturitySuggestionField';
import { CollectionSelector } from './CollectionSelector';
import { useExpertMode } from '@/hooks/useExpertMode';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ParsedNumberInput, ParsedInput } from '@/components/ui/ParsedInput';
import { isFormDirty, haveSameIds } from '@/lib/forms/dirtyState';
import { buildEditPatch } from '@/lib/forms/editPatch';
import { searchClient } from '@/lib/search/client';
import { CurveGlyph } from '@/components/ui/CurveGlyph';
import { DiscardChangesDialog } from '@/components/ui/DiscardChangesDialog';
import {
  CURVE_SHAPES, DEFAULT_CURVE_SHAPE, curveShapeLabelKey, curveShapeDescriptionKey,
} from '@/lib/maturity-references/curve';
import { SPARKLING_TYPES, SUGAR_LEVELS, WINE_COLORS } from '@shared/inventory';

interface InventoryFormProps {
  open: boolean;
  initialValues?: Partial<InventoryItem>;
  onSubmit: (values: Partial<InventoryItem>, collectionIds: string[]) => void;
  onClose: () => void;
  isSubmitting?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  /**
   * FEAT-04 (ux-ui.md 6.5): when provided, shows a "Scanner une étiquette"
   * entry point in the header (creation mode only) that hands off to the
   * scan flow instead of manual entry. Omitted by callers that don't want
   * the scan option (e.g. the onboarding manual-ingestion step, which has
   * its own dedicated scan step).
   */
  onScanRequested?: () => void;
  /** Category preselected when creating, for pages scoped to one category. */
  defaultCategory?: InventoryCategory;
  /** Cellar preselected when creating (the setup wizard's cellar, FEAT-90 / #685). */
  defaultCellarId?: string | null;
  /**
   * #471 (FEAT-92 c4): edit a wine's description, shared by all its bottles
   * (`units` of them in stock), instead of one bottle: the fields of a
   * bottle (cellar, price, number, state) are not shown, and the form says
   * how many bottles the change applies to.
   */
  descriptionOf?: { units: number; kind: UnitKind };
}

const EMPTY_FORM: Partial<InventoryItem> = {
  category: 'wine',
  name: '',
  producer: '',
  tags: [],
  grapeVarieties: [],
  isOwned: true,
  isOpened: false,
  alertStatus: 'none',
};

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <GlassWater size={14} />,
  cigar: <Leaf size={14} />,
};

// #498: one colour per category everywhere (ux-ui.md §4.6).
const CATEGORY_COLORS = CATEGORY_CHIP_COLOR;

export function InventoryForm({
  open, initialValues, onSubmit, onClose, isSubmitting = false, t, onScanRequested, defaultCategory, defaultCellarId, descriptionOf,
}: InventoryFormProps) {
  const { data: cellars } = useCellars();
  const { data: allCollections } = useCollections();
  const isExpert = useExpertMode();
  const emptyForm: Partial<InventoryItem> = {
    ...EMPTY_FORM,
    ...(defaultCategory ? { category: defaultCategory } : {}),
    ...(defaultCellarId ? { cellarId: defaultCellarId } : {}),
  };
  const [values, setValues] = useState<Partial<InventoryItem>>(initialValues ?? emptyForm);
  // ISSUE_119: snapshot of the values the form opened with, used to tell
  // whether closing now would throw away something the user typed.
  const [baseline, setBaseline] = useState<Partial<InventoryItem>>(initialValues ?? emptyForm);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Inline errors show on blur or on submit (ux-ui.md §5.3), and go away
  // while the field is typed in again, so a year being typed never shows red.
  const [peakWindowChecked, setPeakWindowChecked] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState<Collection[]>([]);
  const [showOptionals, setShowOptionals] = useState(false);
  const [prefetchedImages, setPrefetchedImages] = useState<ImageResult[]>([]);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  // Last automatic photo pick and the "producer name" it was made for.
  const [autoPhoto, setAutoPhoto] = useState<{ query: string; path: string | null } | null>(null);
  const isEditing = Boolean(initialValues?.id);
  // A bottle's own fields (cellar, price, number, state): not in a wine's description.
  const showsBottle = !descriptionOf;

  const setField = (field: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  // Resetting form state on open/initialValues change: adjusted during
  // render (React's documented pattern for this) rather than in an effect,
  // by comparing against the previous render's values and guarding with
  // setPrevOpen/setPrevInitialValues so the reset runs at most once per
  // actual change instead of looping.
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevInitialValues, setPrevInitialValues] = useState(initialValues);
  if (open !== prevOpen || initialValues !== prevInitialValues) {
    setPrevOpen(open);
    setPrevInitialValues(initialValues);
    if (open) {
      setValues(initialValues ?? emptyForm);
      setBaseline(initialValues ?? emptyForm);
      setSubmitAttempted(false);
      setPeakWindowChecked(false);
      setSelectedCollections(
        initialValues?.collections?.map(ic => ({
          id: ic.id, name: ic.name, color: ic.color, icon: ic.icon ?? undefined,
          userId: '', items: [], createdAt: '', updatedAt: '',
        })) ?? []
      );
      setShowOptionals(false);
      setPrefetchedImages([]);
      setIsAutoLoading(false);
      setAutoPhoto(null);
    }
  }

  // The automatic photo (#227) follows the name until the user picks one.
  // It used to be fetched once, after the first 1.2 s pause, so a pause while
  // typing attached the photo of a half-typed name for good (#706).
  useEffect(() => {
    if (isEditing || !values.name?.trim() || !values.producer?.trim()) return;
    const query = `${values.producer} ${values.name}`.trim();
    const previousPath = autoPhoto?.path ?? null;
    // A photo that is not the last automatic pick was chosen by the user.
    const userPhoto = Boolean(values.photoUrl) && values.photoUrl !== previousPath;
    // Same query as the last pick: done, even if the user removed that photo.
    if (userPhoto || autoPhoto?.query === query) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsAutoLoading(true);
      try {
        const results = await searchClient.searchImages(query);
        if (cancelled) return;
        setPrefetchedImages(results);
        const path = (results.length > 0 && (await searchClient.saveImageFromUrl(results[0].url))) || null;
        // Typed on, or picked a photo, meanwhile: this result is stale.
        if (cancelled) return;
        setAutoPhoto({ query, path });
        // Only an empty field or the previous automatic pick is replaced; with
        // no photo found for the new name, the stale one is removed.
        setValues((prev) =>
          (!prev.photoUrl && !path) || (prev.photoUrl && prev.photoUrl !== previousPath)
            ? prev
            : { ...prev, photoUrl: path ?? undefined });
      } catch { /* ignore */ } finally {
        // A newer search owns the spinner once this one is stale.
        if (!cancelled) setIsAutoLoading(false);
      }
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); setIsAutoLoading(false); };
  }, [values.name, values.producer, values.photoUrl, isEditing, autoPhoto]);

  const missingName = !values.name?.trim();
  const missingProducer = !values.producer?.trim();
  const missingAlcoholDegree = values.category === 'spirit' && (values.alcoholDegree == null || Number.isNaN(values.alcoholDegree));
  const missingQuantity = showsBottle && values.category === 'cigar' && (values.quantity == null || Number.isNaN(values.quantity));
  // #706: a peak window ending before it starts is refused, as by the API.
  const peakWindowReversed = ['wine', 'sparkling'].includes(values.category ?? '')
    && values.peakMaturityFrom != null && values.peakMaturityTo != null
    && values.peakMaturityTo < values.peakMaturityFrom;
  const missingRequired = !values.category || missingName || missingProducer || missingAlcoholDegree || missingQuantity;
  const canSave = !missingRequired && !peakWindowReversed;

  // ISSUE_119: closing a half-filled form must never discard the entry silently.
  const baselineCollectionIds = initialValues?.collections?.map(c => c.id) ?? [];
  const isDirty = isFormDirty(baseline, values)
    || !haveSameIds(baselineCollectionIds, selectedCollections.map(c => c.id));
  const guard = useUnsavedChangesGuard({
    isOpen: open,
    isDirty,
    onClose,
    isLocked: isSubmitting,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      setSubmitAttempted(true);
      setPeakWindowChecked(true);
      notifyError(missingRequired ? 'inventory.validation.missingFields' : 'inventory.validation.peakWindowOrder');
      return;
    }
    // alertStatus is recomputed server-side from peakMaturity — never send it as-is.
    // readiness (FEAT-86) is a server-computed, read-only projection — drop it too.
    // lockedFields (ISSUE_031) is internal bookkeeping the server itself
    // maintains on every manual edit — round-tripping it unchanged used to
    // disable that very auto-lock (the API now strips it either way, but the
    // form has no legitimate reason to send it).
    // cellarId 'none' is a UI sentinel → null.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { alertStatus: _drop, readiness: _drop2, lockedFields: _drop3, ...rest } = values;
    // #572: an edit sends only the fields the user changed (emptied ones as null).
    const sent: Partial<InventoryItem> = isEditing && initialValues ? buildEditPatch(initialValues, rest) : rest;
    const patch = 'cellarId' in sent
      ? { ...sent, cellarId: sent.cellarId === ('none' as string) || sent.cellarId === '' ? null : sent.cellarId }
      : sent;
    onSubmit(patch, selectedCollections.map(c => c.id));
  };

  const hasPeakCategories = ['wine', 'sparkling'].includes(values.category ?? '');

  const category = (values.category ?? 'wine') as InventoryCategory;
  const isWine = category === 'wine';
  const isSparkling = category === 'sparkling';
  const isSpirit = category === 'spirit';
  const isCigar = category === 'cigar';
  const isWineOrSparkling = isWine || isSparkling;

  return (
    <>
    <ResponsiveModal
      isOpen={open && !guard.isConfirmOpen}
      onClose={guard.requestClose}
      {...guard.dismissProps}
      size="4xl"
      radius="lg"
      backdrop="opaque"
      placement="top"
      scrollBehavior="inside"
      hideCloseButton
    >
      <ModalContent>
        {() => (
          <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
            <ModalHeader className="flex items-center justify-between gap-3 pr-4 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Chip
                  startContent={CATEGORY_ICONS[category]}
                  color={CATEGORY_COLORS[category]}
                  size="sm"
                  variant="flat"
                >
                  {t(`categories.${category}`)}
                </Chip>
                <span className="text-base font-semibold">
                  {descriptionOf
                    ? t(category === 'cigar' ? 'familyDrawer.form.titleCigar' : category === 'spirit' ? 'familyDrawer.form.titleSpirit' : 'familyDrawer.form.title')
                    : isEditing ? t('inventory.edit') : t('inventory.add')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && onScanRequested && (
                  <Button
                    size="sm"
                    color="secondary"
                    variant="flat"
                    startContent={<Camera size={15} />}
                    onPress={onScanRequested}
                    isDisabled={isSubmitting}
                  >
                    {t('scan.launchButton')}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={guard.requestClose}
                  disabled={isSubmitting}
                  className="p-1 rounded-lg hover:bg-default-100 transition-colors"
                  aria-label={t('actions.close')}
                >
                  <X size={16} />
                </button>
              </div>
            </ModalHeader>

            <ModalBody className="p-0 flex flex-col sm:flex-row items-stretch gap-0 min-h-0 overflow-hidden flex-1">
              {/* Image panel — used to be `hidden sm:block`, i.e. entirely
                  unreachable on mobile (no way to edit/upload a photo at
                  all below the sm breakpoint). Now stacks on top, centered,
                  same compact size as the desktop column, instead of being
                  hidden. */}
              <div className="w-[170px] mx-auto sm:mx-0 shrink-0 border-b sm:border-b-0 sm:border-r border-divider px-4 py-5">
                <ItemImageSection
                  photoUrl={values.photoUrl ?? ''}
                  onPhotoChange={(url) => setField('photoUrl', url)}
                  category={category}
                  autoSearchQuery={[values.producer, values.name].filter(Boolean).join(' ')}
                  preloadedResults={prefetchedImages}
                  isAutoLoading={isAutoLoading}
                />
              </div>

              {/* Right form fields */}
              <div className="flex-1 min-w-0 min-h-0 px-6 py-5 overflow-y-auto">
                <div className="flex flex-col gap-6">

                  {descriptionOf && (
                    <p data-testid="description-scope" className="text-sm text-foreground-500 -mb-2">
                      {descriptionOf.kind === 'cigar'
                        ? t('familyDrawer.form.scopeCigar', { count: descriptionOf.units })
                        : t('familyDrawer.form.scope', {
                          count: descriptionOf.units,
                          what: t(category === 'spirit' ? 'familyDrawer.form.thisSpirit' : 'familyDrawer.form.thisWine'),
                        })}
                    </p>
                  )}

                  {/* Section 1: Identity */}
                  <div>
                    <p className="text-xs font-semibold text-foreground-500 mb-3">{t('inventory.step1')}</p>

                    {/* Category chips */}
                    <div role="group" aria-label={t('inventory.fields.category')} className="flex flex-wrap gap-1.5 mb-4">
                      {CATEGORY_VALUES.map((cat) => (
                        <FilterChip
                          key={cat}
                          size="md"
                          startContent={CATEGORY_ICONS[cat]}
                          color={CATEGORY_COLORS[cat]}
                          selected={category === cat}
                          onPress={() => setField('category', cat)}
                        >
                          {t(`categories.${cat}`)}
                        </FilterChip>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <ProductAutocomplete
                        value={values.name ?? ''}
                        onChange={(name) => setField('name', name)}
                        onSelect={(s: ProductSuggestion) =>
                          setValues((prev) => ({
                            ...prev,
                            name: s.name,
                            producer: s.producer ?? prev.producer,
                            category: (s.category as InventoryCategory) ?? prev.category,
                            vintage: s.vintage ?? prev.vintage,
                            bottleSize: s.bottleSize ?? prev.bottleSize,
                            format: s.format ?? prev.format,
                            region: s.region ?? prev.region,
                          }))
                        }
                        category={values.category ?? 'wine'}
                        // #643: the name can be corrected; a suggestion would
                        // overwrite the producer, vintage and region of the bottle.
                        suggestions={!isEditing}
                        autoFocus={!isEditing}
                        isInvalid={submitAttempted && missingName}
                      />
                      <ProducerAutocomplete
                        value={values.producer ?? ''}
                        onChange={(producer) => setField('producer', producer)}
                        category={values.category ?? 'wine'}
                        label={t('inventory.fields.producer')}
                        placeholder={t(`inventory.fields.producerPlaceholder.${category}`)}
                        required
                        isInvalid={submitAttempted && missingProducer}
                      />
                      {showsBottle && (
                      <Select
                        label={t('nav.caves')}
                        variant="bordered"
                        size="sm"
                        items={[{ id: 'none', name: t('inventory.noCellar') }, ...(cellars ?? [])]}
                        selectedKeys={[values.cellarId === null ? 'none' : (values.cellarId ?? 'none')]}
                        onSelectionChange={(keys) => setField('cellarId', Array.from(keys)[0] === 'none' ? null : Array.from(keys)[0])}
                      >
                        {(item) => (
                          // textValue is what the trigger shows: without it, the
                          // selected "Aucune cave" showed a blank field (#706).
                          <SelectItem key={item.id} textValue={item.name}>
                            {item.id === 'none' ? <em>{item.name}</em> : item.name}
                          </SelectItem>
                        )}
                      </Select>
                      )}
                    </div>
                  </div>

                  <Divider />

                  {/* Section 2: Category fields */}
                  <div>
                    <p className="text-xs font-semibold text-foreground-500 mb-3">{t('inventory.step2')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                      {/* Wine essential */}
                      {isWine && (
                        <>
                          <ParsedNumberInput
                            data-testid="inventory-vintage-input"
                            label={t('inventory.fields.vintage')}
                            variant="bordered"
                            size="sm"
                            value={values.vintage}
                            onValueChange={(v) => setField('vintage', v)}
                            description={t('inventory.fields.noVintage')}
                            min={1800} max={new Date().getFullYear()}
                          />
                          <Select
                            label={t('inventory.fields.color')}
                            variant="bordered"
                            size="sm"
                            selectedKeys={values.color ? [values.color] : []}
                            onSelectionChange={(keys) => setField('color', Array.from(keys)[0] || undefined)}
                          >
                            {(['', ...WINE_COLORS]).map((c) => (
                              <SelectItem key={c}>{c ? t(`inventory.color.${c}`) : <em>—</em>}</SelectItem>
                            ))}
                          </Select>
                          <div className="col-span-2">
                            <Input
                              label={t('inventory.fields.region')}
                              variant="bordered"
                              size="sm"
                              value={values.region ?? ''}
                              onValueChange={(v) => setField('region', v)}
                            />
                          </div>
                          <ParsedNumberInput decimal
                            label={t('inventory.fields.alcoholDegree')}
                            variant="bordered"
                            size="sm"
                            value={values.alcoholDegree}
                            onValueChange={(v) => setField('alcoholDegree', v)}
                            endContent={<span className="text-xs text-foreground-500">%</span>}
                          />
                        </>
                      )}

                      {/* Sparkling essential */}
                      {isSparkling && (
                        <>
                          <ParsedNumberInput
                            data-testid="inventory-vintage-input"
                            label={t('inventory.fields.vintage')}
                            variant="bordered"
                            size="sm"
                            value={values.vintage}
                            onValueChange={(v) => setField('vintage', v)}
                            description={t('inventory.fields.noVintage')}
                            min={1800} max={new Date().getFullYear()}
                          />
                          <Select
                            label={t('inventory.fields.sparklingType')}
                            variant="bordered"
                            size="sm"
                            selectedKeys={values.sparklingType ? [values.sparklingType] : []}
                            onSelectionChange={(keys) => setField('sparklingType', Array.from(keys)[0] || undefined)}
                          >
                            {(['', ...SPARKLING_TYPES]).map((s) => (
                              <SelectItem key={s}>{s ? t(`inventory.sparklingTypes.${s}`) : <em>—</em>}</SelectItem>
                            ))}
                          </Select>
                          <Select
                            label={t('inventory.fields.sugarLevel')}
                            variant="bordered"
                            size="sm"
                            selectedKeys={values.sugarLevel ? [values.sugarLevel] : []}
                            onSelectionChange={(keys) => setField('sugarLevel', Array.from(keys)[0] || undefined)}
                          >
                            {(['', ...SUGAR_LEVELS]).map((s) => (
                              <SelectItem key={s}>{s ? t(`inventory.sugarLevels.${s}`) : <em>—</em>}</SelectItem>
                            ))}
                          </Select>
                        </>
                      )}

                      {/* Spirit essential */}
                      {isSpirit && (
                        <>
                          <div className="col-span-2">
                            <Select
                              label={t('inventory.fields.spiritType')}
                              variant="bordered"
                              size="sm"
                              selectedKeys={values.spiritType ? [values.spiritType] : []}
                              onSelectionChange={(keys) => setField('spiritType', Array.from(keys)[0] || undefined)}
                            >
                              {(['', 'whisky', 'rhum', 'gin', 'cognac', 'calvados', 'armagnac', 'vodka', 'tequila', 'mezcal', 'liqueur', 'other']).map((s) => (
                                <SelectItem key={s}>{s ? t(`inventory.spiritTypes.${s}`) : <em>—</em>}</SelectItem>
                              ))}
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Input
                              label={t('inventory.fields.edition')}
                              variant="bordered"
                              size="sm"
                              value={values.edition ?? ''}
                              onValueChange={(v) => setField('edition', v)}
                            />
                          </div>
                          <div className="col-span-2">
                            <ParsedNumberInput decimal
                              label={t('inventory.fields.alcoholDegree')}
                              variant="bordered"
                              size="sm"
                              isRequired
                              isInvalid={submitAttempted && missingAlcoholDegree}
                              errorMessage={t('inventory.validation.required')}
                              value={values.alcoholDegree}
                              onValueChange={(v) => setField('alcoholDegree', v)}
                              endContent={<span className="text-xs text-foreground-500">%</span>}
                            />
                          </div>
                          <div className="col-span-2">
                            <ParsedNumberInput
                              label={t('inventory.fields.declaredAge')}
                              variant="bordered"
                              size="sm"
                              value={values.declaredAge}
                              onValueChange={(v) => setField('declaredAge', v)}
                              endContent={<span className="text-xs text-foreground-500">{t('inventory.fields.declaredAgeUnit')}</span>}
                              min={0} max={200}
                            />
                          </div>
                        </>
                      )}

                      {/* Cigar essential */}
                      {isCigar && (
                        <>
                          <Input
                            label={t('inventory.fields.format')}
                            variant="bordered"
                            size="sm"
                            value={values.format ?? ''}
                            onValueChange={(v) => setField('format', v)}
                          />
                          {showsBottle && (
                            <ParsedNumberInput
                              label={t('inventory.fields.quantity')}
                              variant="bordered"
                              size="sm"
                              isRequired
                              isInvalid={submitAttempted && missingQuantity}
                              errorMessage={t('inventory.validation.required')}
                              value={values.quantity}
                              onValueChange={(v) => setField('quantity', v)}
                              min={0}
                            />
                          )}
                          <ParsedNumberInput
                            label={t('inventory.fields.manufactureYear')}
                            variant="bordered"
                            size="sm"
                            value={values.manufactureYear}
                            onValueChange={(v) => setField('manufactureYear', v)}
                            min={1900} max={2100}
                          />
                        </>
                      )}

                      {/* Peak maturity window */}
                      {isWineOrSparkling && (
                        <>
                          <div className="col-span-2 sm:col-span-4 flex items-center gap-2">
                            <div className="flex-1 h-px bg-divider" />
                            <span className="text-xs text-foreground-500 px-2">{t('inventory.fields.peakMaturity')}</span>
                            <div className="flex-1 h-px bg-divider" />
                          </div>
                          <ParsedNumberInput
                            label={t('inventory.fields.peakMaturityFrom')}
                            variant="bordered"
                            size="sm"
                            placeholder={t('inventory.fields.yearExample', { year: 2025 })}
                            value={values.peakMaturityFrom}
                            onValueChange={(v) => { setPeakWindowChecked(false); setField('peakMaturityFrom', v ?? null); }}
                            onBlur={() => setPeakWindowChecked(true)}
                            min={1800} max={2200}
                          />
                          <ParsedNumberInput
                            label={t('inventory.fields.peakMaturityTo')}
                            variant="bordered"
                            size="sm"
                            placeholder={t('inventory.fields.yearExample', { year: 2030 })}
                            value={values.peakMaturityTo}
                            onValueChange={(v) => { setPeakWindowChecked(false); setField('peakMaturityTo', v ?? null); }}
                            onBlur={() => setPeakWindowChecked(true)}
                            isInvalid={peakWindowReversed && peakWindowChecked}
                            errorMessage={t('inventory.validation.peakWindowOrder')}
                            min={1800} max={2200}
                          />
                          {/* FEAT-86: consumption-curve shape override */}
                          <Select
                            className="col-span-2 sm:col-span-4"
                            label={t('inventory.fields.curveShape')}
                            description={t('inventory.fields.curveShapeHint')}
                            variant="bordered"
                            size="sm"
                            disallowEmptySelection
                            popoverProps={{ placement: 'bottom', shouldFlip: true }}
                            selectedKeys={[values.curveShape ?? DEFAULT_CURVE_SHAPE]}
                            onSelectionChange={(keys) => setField('curveShape', Array.from(keys)[0] ?? null)}
                            startContent={
                              <CurveGlyph shape={values.curveShape ?? DEFAULT_CURVE_SHAPE} width={34} className="text-primary shrink-0" />
                            }
                          >
                            {CURVE_SHAPES.map((shape) => (
                              <SelectItem
                                key={shape}
                                textValue={t(curveShapeLabelKey(shape))}
                                description={t(curveShapeDescriptionKey(shape))}
                                startContent={<CurveGlyph shape={shape} width={34} className="text-foreground-500 shrink-0" />}
                              >
                                {t(curveShapeLabelKey(shape))}
                              </SelectItem>
                            ))}
                          </Select>
                        </>
                      )}
                    </div>

                    {/* Maturity suggestion banner */}
                    <MaturitySuggestionField
                      active={hasPeakCategories}
                      category={values.category}
                      region={values.region}
                      color={values.color}
                      producer={values.producer}
                      vintage={values.vintage}
                      onApply={(from, to, curveShape) =>
                        setValues((prev) => ({
                          ...prev,
                          peakMaturityFrom: from ?? prev.peakMaturityFrom,
                          peakMaturityTo: to ?? prev.peakMaturityTo,
                          curveShape: curveShape ?? prev.curveShape,
                        }))
                      }
                    />
                  </div>

                  {/* Section 2.5: Expert / collector fields — "Mode expert" (data-model
                      audit) only, hidden entirely otherwise (never gated behind
                      "Show more" too — expert mode alone decides visibility).
                      Extended to every category (not just wine/spirit): these
                      fields are relevant beyond their originally-assumed
                      category too (appellation/classification apply to
                      protected-designation spirits like Cognac/Scotch, and
                      lot/batch/cask info applies to barrel-aged wine or
                      cigar box codes) — left optional and blank by default,
                      so showing them for every category costs nothing and
                      avoids re-litigating category boundaries per field. */}
                  {isExpert && (
                    <>
                      <Divider />
                      <div>
                        <div className="flex items-center gap-1.5 mb-3">
                          <FlaskConical size={13} className="text-primary" />
                          <p className="text-xs font-semibold text-primary">
                            {t('inventory.expertSection.title')}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <>
                            <div className="col-span-2">
                              <Input
                                label={t('inventory.fields.appellation')}
                                variant="bordered"
                                size="sm"
                                value={values.appellation ?? ''}
                                onValueChange={(v) => setField('appellation', v)}
                              />
                            </div>
                            <div className="col-span-2">
                              <Input
                                label={t('inventory.fields.classification')}
                                placeholder={t('inventory.fields.classificationPlaceholder')}
                                variant="bordered"
                                size="sm"
                                value={values.classification ?? ''}
                                onValueChange={(v) => setField('classification', v)}
                              />
                            </div>
                          </>
                          <>
                            <Input
                                label={t('inventory.fields.lotNumber')}
                                variant="bordered"
                                size="sm"
                                value={values.lotNumber ?? ''}
                                onValueChange={(v) => setField('lotNumber', v)}
                              />
                              <Input
                                label={t('inventory.fields.batchDate')}
                                type="date"
                                variant="bordered"
                                size="sm"
                                value={typeof values.batchDate === 'string' ? values.batchDate.split('T')[0] : ''}
                                onValueChange={(v) => setField('batchDate', v || null)}
                              />
                              <div className="col-span-2">
                                <Input
                                  label={t('inventory.fields.caskType')}
                                  placeholder={t('inventory.fields.caskTypePlaceholder')}
                                  variant="bordered"
                                  size="sm"
                                  value={values.caskType ?? ''}
                                  onValueChange={(v) => setField('caskType', v)}
                                />
                              </div>
                              <Input
                                label={t('inventory.fields.caskNumber')}
                                variant="bordered"
                                size="sm"
                                value={values.caskNumber ?? ''}
                                onValueChange={(v) => setField('caskNumber', v)}
                              />
                              <ParsedNumberInput decimal
                                label={t('inventory.fields.caskProof')}
                                variant="bordered"
                                size="sm"
                                value={values.caskProof}
                                onValueChange={(v) => setField('caskProof', v)}
                                endContent={<span className="text-xs text-foreground-500">%</span>}
                              />
                              <div className="flex items-center">
                                <FilterChip
                                  size="md"
                                  selected={Boolean(values.isSingleCask)}
                                  onPress={() => setField('isSingleCask', !values.isSingleCask)}
                                >
                                  {t('inventory.fields.isSingleCask')}
                                </FilterChip>
                              </div>
                          </>
                        </div>
                      </div>
                    </>
                  )}

                  <Divider />

                  {/* Section 3: Optionals */}
                  <div>
                    <Button
                      size="sm"
                      variant="light"
                      endContent={showOptionals ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      onPress={() => setShowOptionals((prev) => !prev)}
                    >
                      {showOptionals ? t('actions.showLess') : t('actions.showMore')}
                    </Button>

                    {showOptionals && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        {/* Collections */}
                        <CollectionSelector
                          collections={allCollections ?? []}
                          selected={selectedCollections}
                          onSelectedChange={setSelectedCollections}
                        />

                        {/* Purchase price */}
                        {showsBottle && (<>
                        <ParsedNumberInput decimal
                          label={t('inventory.fields.purchasePrice')}
                          variant="bordered"
                          size="sm"
                          value={values.purchasePrice}
                          onValueChange={(v) => setField('purchasePrice', v)}
                          endContent={<span className="text-xs text-foreground-500">{currencySymbol(i18n.language)}</span>}
                        />

                        {/* Purchase place */}
                        <div className="col-span-2">
                          <Input
                            label={t('inventory.fields.purchasePlace')}
                            variant="bordered"
                            size="sm"
                            value={values.purchasePlace ?? ''}
                            onValueChange={(v) => setField('purchasePlace', v)}
                          />
                        </div>

                        {/* Estimated value */}
                        <ParsedNumberInput decimal
                          label={t('inventory.fields.estimatedValue')}
                          variant="bordered"
                          size="sm"
                          value={values.estimatedValue}
                          onValueChange={(v) => setField('estimatedValue', v)}
                          endContent={<span className="text-xs text-foreground-500">{currencySymbol(i18n.language)}</span>}
                        />
                        </>)}

                        {/* Notes */}
                        <div className="col-span-2 sm:col-span-4">
                          <Input
                            label={t('inventory.fields.notes')}
                            variant="bordered"
                            size="sm"
                            value={values.notes ?? ''}
                            onValueChange={(v) => setField('notes', v)}
                          />
                        </div>

                        {/* Wine/Sparkling optionals */}
                        {isWineOrSparkling && (
                          <>
                            {showsBottle && (
                              <Input
                                label={t('inventory.fields.bottleSize')}
                                variant="bordered"
                                size="sm"
                                value={values.bottleSize ?? ''}
                                onValueChange={(v) => setField('bottleSize', v)}
                              />
                            )}
                            <Input
                              label={t('inventory.fields.serviceTemp')}
                              placeholder={t('inventory.fields.serviceTempPlaceholder')}
                              variant="bordered"
                              size="sm"
                              value={values.serviceTemp ?? ''}
                              onValueChange={(v) => setField('serviceTemp', v)}
                            />
                            {isWine && (
                              <>
                                <div className="col-span-2 sm:col-span-4">
                                  <ParsedInput
                                    label={t('inventory.fields.grapeVarieties')}
                                    placeholder={t('inventory.fields.grapeVarietiesHint')}
                                    variant="bordered"
                                    size="sm"
                                    value={values.grapeVarieties ?? []}
                                    format={(list) => list.join(', ')}
                                    parse={(text) => text.split(',').map((s) => s.trim()).filter(Boolean)}
                                    onValueChange={(list) => setField('grapeVarieties', list)}
                                  />
                                </div>
                                <Input
                                  label={t('inventory.fields.lotNumber')}
                                  variant="bordered"
                                  size="sm"
                                  value={values.lotNumber ?? ''}
                                  onValueChange={(v) => setField('lotNumber', v)}
                                />
                                <div className="flex items-center">
                                  <FilterChip
                                    size="md"
                                    selected={Boolean(values.needsAeration)}
                                    onPress={() => setField('needsAeration', !values.needsAeration)}
                                  >
                                    {t('inventory.fields.needsAeration')}
                                  </FilterChip>
                                </div>
                              </>
                            )}
                            {isSparkling && (
                              <>
                                <ParsedNumberInput
                                  label={t('inventory.fields.baseYear')}
                                  variant="bordered"
                                  size="sm"
                                  value={values.baseYear}
                                  onValueChange={(v) => setField('baseYear', v)}
                                  min={1800} max={2100}
                                />
                                <Input
                                  label={t('inventory.fields.disgorgingDate')}
                                  type="date"
                                  variant="bordered"
                                  size="sm"
                                  value={typeof values.disgorgingDate === 'string' ? values.disgorgingDate.split('T')[0] : ''}
                                  onValueChange={(v) => setField('disgorgingDate', v || null)}
                                />
                              </>
                            )}
                          </>
                        )}

                        {/* Spirit optionals — caskType lives in the "Section 2.5" expert
                            block above now (grouped with the other fût/batch fields,
                            data-model audit Task 3), not duplicated here. */}
                        {isSpirit && (
                          <>
                            <div className="col-span-2">
                              <Input
                                label={t('inventory.fields.aromaticProfile')}
                                variant="bordered"
                                size="sm"
                                value={values.aromaticProfile ?? ''}
                                onValueChange={(v) => setField('aromaticProfile', v)}
                              />
                            </div>
                            <div className="col-span-2">
                              <Input
                                label={t('inventory.fields.additions')}
                                variant="bordered"
                                size="sm"
                                value={values.additions ?? ''}
                                onValueChange={(v) => setField('additions', v)}
                              />
                            </div>
                            {showsBottle && (
                              <Input
                                label={t('inventory.fields.bottleSize')}
                                variant="bordered"
                                size="sm"
                                value={values.bottleSize ?? ''}
                                onValueChange={(v) => setField('bottleSize', v)}
                              />
                            )}
                          </>
                        )}

                        {/* Cigar optionals */}
                        {isCigar && (
                          <>
                            <div className="col-span-2">
                              <Input
                                label={t('inventory.fields.leafOrigin')}
                                variant="bordered"
                                size="sm"
                                value={values.leafOrigin ?? ''}
                                onValueChange={(v) => setField('leafOrigin', v)}
                              />
                            </div>
                            <Input
                              label={t('inventory.fields.factoryCode')}
                              variant="bordered"
                              size="sm"
                              value={values.factoryCode ?? ''}
                              onValueChange={(v) => setField('factoryCode', v)}
                            />
                            <ParsedNumberInput decimal
                              label={t('inventory.fields.recommendedHumidity')}
                              variant="bordered"
                              size="sm"
                              value={values.recommendedHumidity}
                              onValueChange={(v) => setField('recommendedHumidity', v)}
                              endContent={<span className="text-xs text-foreground-500">%</span>}
                            />
                            <div className="col-span-2">
                              <Input
                                label={t('inventory.fields.humidificationSystem')}
                                variant="bordered"
                                size="sm"
                                value={values.humidificationSystem ?? ''}
                                onValueChange={(v) => setField('humidificationSystem', v)}
                              />
                            </div>
                          </>
                        )}

                        {/* FEAT-87: owned item vs non-owned reference. An item
                            created before this field existed has no `isOwned`
                            and is owned. */}
                        {showsBottle && (
                        <div className="col-span-2 sm:col-span-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant={(values.isOwned ?? true) ? 'solid' : 'bordered'}
                              color={(values.isOwned ?? true) ? 'success' : 'default'}
                              onPress={() => setField('isOwned', true)}
                            >
                              {(values.isOwned ?? true) ? '✓ ' : ''}{t('inventory.fields.isOwned')}
                            </Button>
                            <Button
                              size="sm"
                              variant={(values.isOwned ?? true) ? 'bordered' : 'solid'}
                              color={(values.isOwned ?? true) ? 'default' : 'secondary'}
                              onPress={() => {
                                // A reference has nothing to open and no level.
                                setField('isOwned', false);
                                setField('isOpened', false);
                                setField('fillLevel', null);
                                setField('openedAt', null);
                              }}
                            >
                              {(values.isOwned ?? true) ? '' : '✓ '}{t('inventory.fields.isReference')}
                            </Button>
                          </div>
                          {!(values.isOwned ?? true) && (
                            <p className="text-xs text-default-500 mt-1.5">{t('inventory.fields.isReferenceHint')}</p>
                          )}
                        </div>
                        )}

                        {/* Opened status — a reference has no bottle to open */}
                        {showsBottle && (values.isOwned ?? true) && (
                          <div className="col-span-2 sm:col-span-4">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={values.isOpened ? 'solid' : 'bordered'}
                                color={values.isOpened ? 'warning' : 'default'}
                                onPress={() => {
                                  const next = !values.isOpened;
                                  setField('isOpened', next);
                                  if (next && !values.openedAt) {
                                    setField('openedAt', todayLocalIso());
                                  }
                                }}
                              >
                                {values.isOpened ? '✓ ' : ''}{t('inventory.fields.isOpened')}
                              </Button>
                            </div>
                          </div>
                        )}

                        {showsBottle && (values.isOwned ?? true) && values.isOpened && (
                          <>
                            <div className="col-span-2 sm:col-span-4">
                              <p className="text-xs text-foreground-500 mb-1.5">{t('inventory.fields.fillLevel')}</p>
                              <div role="group" aria-label={t('inventory.fields.fillLevel')} className="flex flex-wrap gap-1.5">
                                {([100, 75, 50, 25, 0] as const).map((val) => (
                                  <FilterChip
                                    key={val}
                                    color="warning"
                                    selected={values.fillLevel === val}
                                    onPress={() => setField('fillLevel', val)}
                                  >
                                    {t(`inventory.fillLevels.${val === 100 ? 'full' : val === 75 ? 'threeQuarters' : val === 50 ? 'half' : val === 25 ? 'quarter' : 'empty'}`)}
                                  </FilterChip>
                                ))}
                              </div>
                            </div>
                            <Input
                              label={t('inventory.fields.openedAt')}
                              type="date"
                              variant="bordered"
                              size="sm"
                              value={typeof values.openedAt === 'string' ? values.openedAt.split('T')[0] : ''}
                              onValueChange={(v) => setField('openedAt', v || null)}
                            />
                            <Input
                              label={t('inventory.fields.reminderDate')}
                              type="date"
                              variant="bordered"
                              size="sm"
                              value={typeof values.reminderDate === 'string' ? values.reminderDate.split('T')[0] : ''}
                              onValueChange={(v) => setField('reminderDate', v || null)}
                            />
                          </>
                        )}

                        {/* #471: the reminder is the wine's, whatever its bottles. */}
                        {!showsBottle && (
                          <Input
                            label={t('inventory.fields.reminderDate')}
                            type="date"
                            variant="bordered"
                            size="sm"
                            value={typeof values.reminderDate === 'string' ? values.reminderDate.split('T')[0] : ''}
                            onValueChange={(v) => setField('reminderDate', v || null)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ModalBody>

            <ModalFooter className="gap-2 pt-3 shrink-0">
              <Button data-testid="inventory-form-cancel" variant="bordered" onPress={guard.requestClose} isDisabled={isSubmitting}>
                {t('actions.cancel')}
              </Button>
              <Button
                data-testid="inventory-form-submit"
                type="submit"
                color="primary"
                startContent={<Save size={15} />}
                isDisabled={isSubmitting}
                isLoading={isSubmitting}
              >
                {isSubmitting
                  ? t('status.saving')
                  : isEditing
                    ? t('actions.update')
                    : t('inventory.saveMinimal')}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </ResponsiveModal>

    <DiscardChangesDialog
      isOpen={guard.isConfirmOpen}
      onCancel={guard.cancelDiscard}
      onConfirm={guard.confirmDiscard}
    />
    </>
  );
}
