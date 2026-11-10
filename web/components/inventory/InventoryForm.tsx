'use client';
import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Divider, Input, SelectItem,
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
import { FILL_LEVELS } from '@/lib/products/fillLevels';
import { parseTags } from '@/lib/products/tags';
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
import { isAboutItem } from '@/lib/search/relevance';
import { CurveGlyph } from '@/components/ui/CurveGlyph';
import { DiscardChangesDialog } from '@/components/ui/DiscardChangesDialog';
import {
  CURVE_SHAPES, DEFAULT_CURVE_SHAPE, curveShapeLabelKey, curveShapeDescriptionKey,
} from '@/lib/maturity-references/curve';
import { SPARKLING_TYPES, SUGAR_LEVELS, WINE_COLORS } from '@shared/inventory';
import { MAX_COPIES } from '@shared/product';
import { DESCRIPTION_LIMITS } from '@shared/review';
import { CigarGroupFields } from './CigarGroupFields';
import { KnownWineBanner } from './KnownWineBanner';
import { AddUnitsForm } from './AddUnitsDialog';
import { useKnownWine } from '@/hooks/useKnownWine';
import type { UnitWrite } from '@/lib/products/client';
import type { Product } from '@/lib/products/types';
import {
  cigarGroupInput, cigarPriceKey, cigarValueKey, isCigarGroupValid, type CigarGroupDraft, type CigarStorage,
} from '@/lib/products/cigarGroup';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { halfFieldColumns, halfFieldSpan, lastFieldDesktopSpan } from '@/lib/inventory/fieldSpan';

/**
 * A half-width field of the form's grids: its label, and two columns when that
 * label — or the one of the field sharing its phone row — is long (#867).
 */
const halfField = (label: string, partnerLabel?: string) => ({ label, className: halfFieldSpan(label, partnerLabel) });

/** Class names joined, the missing ones left out. */
const cx = (...names: (string | undefined)[]) => names.filter(Boolean).join(' ');

/**
 * What a new entry sends. `distinctFrom` (#471, FEAT-97 c5): the wines of the
 * same name the member answered "C'est un autre vin" to.
 */
export type InventoryEntry = Partial<InventoryItem> & { distinctFrom?: string[] };

interface InventoryFormProps {
  open: boolean;
  initialValues?: Partial<InventoryItem>;
  onSubmit: (values: InventoryEntry, collectionIds: string[]) => void;
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
  /**
   * #471 (FEAT-97): "Vous avez déjà ce vin" was accepted and the bottles were
   * added to that wine (the reduced form) — the entry is done; the form
   * closes right after (`onClose`).
   */
  onJoined?: (write: UnitWrite, product: Product) => void;
}

const EMPTY_FORM: Partial<InventoryItem> = {
  category: 'wine',
  name: '',
  producer: '',
  tags: [],
  grapeVarieties: [],
  isOpened: false,
  alertStatus: 'none',
};

/**
 * #471 (FEAT-92 c1, FEAT-95, ux-ui.md §10.4.1): what a new entry starts with
 * — one bottle, or one closed box (its size to fill in), bought today
 * (`YYYY-MM-DD`, D6).
 */
const creationDefaults = (): Partial<InventoryItem> => ({
  purchasedAt: todayLocalIso(),
  quantity: 1,
});

/** FEAT-95: closed boxes unless the entry says single cigars (a box size cleared). */
const storageOf = (values?: Partial<InventoryItem>): CigarStorage =>
  values && 'cigarsPerBox' in values && values.cigarsPerBox === null ? 'singles' : 'boxes';

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
  onJoined,
}: InventoryFormProps) {
  const { data: cellars } = useCellars();
  const { data: allCollections } = useCollections();
  const isExpert = useExpertMode();
  const emptyForm: Partial<InventoryItem> = {
    ...EMPTY_FORM,
    ...(defaultCategory ? { category: defaultCategory } : {}),
    ...(defaultCellarId ? { cellarId: defaultCellarId } : {}),
    ...creationDefaults(),
  };
  // A new entry prefilled by a scan gets the same defaults, under its values.
  const startValues = (): Partial<InventoryItem> =>
    !initialValues ? emptyForm
      : initialValues.id || descriptionOf ? initialValues
        : {
          ...creationDefaults(),
          // A value the scan left undefined (a wine's number) keeps the default.
          ...Object.fromEntries(Object.entries(initialValues).filter(([, value]) => value !== undefined)),
        };
  const [values, setValues] = useState<Partial<InventoryItem>>(startValues);
  // FEAT-95: closed boxes or single cigars — kept apart from the values, an
  // empty box size being typed in is not "single cigars".
  const [cigarStorage, setCigarStorage] = useState<CigarStorage>(() => storageOf(initialValues));
  // ISSUE_119: snapshot of the values the form opened with, used to tell
  // whether closing now would throw away something the user typed.
  const [baseline, setBaseline] = useState<Partial<InventoryItem>>(startValues);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Inline errors show on blur or on submit (ux-ui.md §5.3), and go away
  // while the field is typed in again, so a year being typed never shows red.
  const [peakWindowChecked, setPeakWindowChecked] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState<Collection[]>([]);
  const [showOptionals, setShowOptionals] = useState(false);
  // #708: a save refused for the tags shows their field, folded in the optionals.
  const tagsInput = useRef<HTMLInputElement>(null);
  const [prefetchedImages, setPrefetchedImages] = useState<ImageResult[]>([]);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  // #862: the photo suggested for "category producer name" — the results
  // about the item and the one shown; never attached until accepted.
  const [photoSuggestion, setPhotoSuggestion] = useState<{ key: string; results: ImageResult[]; index: number } | null>(null);
  const isEditing = Boolean(initialValues?.id);
  // A bottle's own fields (cellar, price, number, state): not in a wine's description.
  const showsBottle = !descriptionOf;
  // #471 (FEAT-97): "Vous avez déjà ce vin" — the wine whose reduced form is
  // shown, and the wines answered "C'est un autre vin".
  const [joining, setJoining] = useState<Product | null>(null);
  const [distinctFrom, setDistinctFrom] = useState<string[]>([]);

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
      const start = startValues();
      setValues(start);
      setBaseline(start);
      setCigarStorage(storageOf(initialValues));
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
      setPhotoSuggestion(null);
      setJoining(null);
      setDistinctFrom([]);
    }
  }

  // FEAT-97 c1, c3: the wines of the same name as the one typed (a new entry only).
  const sameName = useKnownWine(
    { category: values.category, producer: values.producer, name: values.name, vintage: values.vintage, format: values.format },
    open && !isEditing && showsBottle,
  );
  const knownWines = sameName.filter((product) => !distinctFrom.includes(product.id));
  // "C'est un autre vin", for the wine still typed: sent with the entry (c5).
  const toldApart = sameName.filter((product) => distinctFrom.includes(product.id)).map((product) => product.id);
  const finishJoin = () => {
    setJoining(null);
    onClose();
  };

  // The photo suggestion (#227) follows the name until a photo is set; it
  // waits for a 1.2 s pause so a half-typed name is not searched (#706). It
  // used to download the first result as the photo without asking (#862).
  const suggestionQuery = `${values.producer ?? ''} ${values.name ?? ''}`.trim();
  const suggestionCategory = values.category ?? 'wine';
  const suggestionKey = `${suggestionCategory} ${suggestionQuery}`;
  const lastSuggestionKey = photoSuggestion?.key;
  useEffect(() => {
    if (isEditing || values.photoUrl || !values.name?.trim() || !values.producer?.trim()) return;
    if (lastSuggestionKey === suggestionKey) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsAutoLoading(true);
      try {
        const results = await searchClient.searchImages(suggestionQuery, suggestionCategory);
        if (cancelled) return;
        setPrefetchedImages(results);
        setPhotoSuggestion({
          key: suggestionKey,
          results: results.filter((result) => isAboutItem(result.title, values.name, values.producer)),
          index: 0,
        });
      } catch { /* no suggestion: the photo stays empty */ } finally {
        // A newer search owns the spinner once this one is stale.
        if (!cancelled) setIsAutoLoading(false);
      }
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); setIsAutoLoading(false); };
  }, [values.name, values.producer, values.photoUrl, isEditing, suggestionQuery, suggestionCategory, suggestionKey, lastSuggestionKey]);
  // Only the suggestion for what is typed now; "dismiss" moves past the last one.
  const suggestedPhoto = photoSuggestion?.key === suggestionKey ? photoSuggestion.results[photoSuggestion.index] : undefined;
  // Bound to the name it was found for: an answer arriving after the name
  // changed never moves the suggestion of the new name.
  const showNextSuggestion = (key: string, count: number) =>
    setPhotoSuggestion((prev) => prev && prev.key === key ? { ...prev, index: prev.index + count } : prev);
  // Once a photo is set (the suggestion accepted or another one chosen), none
  // is offered again for this name, even if that photo is removed.
  const changePhoto = (url: string) => {
    setField('photoUrl', url);
    if (url) setPhotoSuggestion({ key: suggestionKey, results: [], index: 0 });
  };

  const missingName = !values.name?.trim();
  const missingProducer = !values.producer?.trim();
  const missingAlcoholDegree = values.category === 'spirit' && (values.alcoholDegree == null || Number.isNaN(values.alcoholDegree));
  // #471 (FEAT-95): N closed boxes of M cigars, or N single cigars; one box
  // only may be stored opened, with the cigars left in it.
  const cigarDraft: CigarGroupDraft = { storage: cigarStorage, quantity: values.quantity, cigarsPerBox: values.cigarsPerBox };
  const createsCigars = showsBottle && !isEditing && values.category === 'cigar';
  const canOpenBox = cigarStorage === 'boxes' && values.quantity === 1;
  const opensBox = createsCigars && canOpenBox && Boolean(values.isOpened);
  const invalidCigarsLeft = opensBox && (values.cigarsLeft == null || !Number.isInteger(values.cigarsLeft)
    || values.cigarsLeft < 1 || values.cigarsLeft > (values.cigarsPerBox ?? MAX_COPIES));
  const missingQuantity = createsCigars && (!isCigarGroupValid(cigarDraft) || invalidCigarsLeft);
  // #471 (FEAT-92): from 1 to what one group may count.
  const invalidBottleCount = showsBottle && values.category !== 'cigar'
    && (values.quantity == null || !Number.isInteger(values.quantity) || values.quantity < 1 || values.quantity > MAX_COPIES);
  // #706: a peak window ending before it starts is refused, as by the API.
  const peakWindowReversed = ['wine', 'sparkling'].includes(values.category ?? '')
    && values.peakMaturityFrom != null && values.peakMaturityTo != null
    && values.peakMaturityTo < values.peakMaturityFrom;
  // #708: as many tags, as long, as the API takes.
  const invalidTags = (values.tags ?? []).length > DESCRIPTION_LIMITS.tags
    || (values.tags ?? []).some((tag) => tag.length > DESCRIPTION_LIMITS.tagLength);
  const missingRequired = !values.category || missingName || missingProducer || missingAlcoholDegree || missingQuantity || invalidBottleCount;
  const tagLimits = { max: DESCRIPTION_LIMITS.tags, length: DESCRIPTION_LIMITS.tagLength };
  const canSave = !missingRequired && !peakWindowReversed && !invalidTags;

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
      notifyError(missingRequired ? 'inventory.validation.missingFields'
        : invalidTags ? 'inventory.validation.tags' : 'inventory.validation.peakWindowOrder', tagLimits);
      if (!missingRequired && invalidTags) {
        flushSync(() => setShowOptionals(true));
        tagsInput.current?.focus();
      }
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
    if (createsCigars) {
      // FEAT-95: a group of cigars — no level (a box is not filled), and the
      // cigars left only in the one box stored opened.
      delete sent.fillLevel;
      Object.assign(sent, cigarGroupInput(cigarDraft), opensBox
        ? { isOpened: true, cigarsLeft: values.cigarsLeft }
        : { isOpened: false, cigarsLeft: null, openedAt: null });
    }
    const patch = 'cellarId' in sent
      ? { ...sent, cellarId: sent.cellarId === ('none' as string) || sent.cellarId === '' ? null : sent.cellarId }
      : sent;
    onSubmit(toldApart.length > 0 ? { ...patch, distinctFrom: toldApart } : patch, selectedCollections.map(c => c.id));
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
        {() => joining ? (
          // FEAT-97 c2 (ux-ui.md §10.4.1): the form reduced to the bottles —
          // number, size, cellar, price and day; what was typed is kept.
          <AddUnitsForm
            product={joining}
            start={{
              quantity: category === 'cigar' ? undefined : values.quantity ?? undefined,
              cellarId: values.cellarId,
              purchasePrice: values.purchasePrice ?? undefined,
              bottleSize: values.bottleSize ?? undefined,
              purchasedAt: values.purchasedAt ?? undefined,
            }}
            cancelLabel={t('knownWine.backToEntry')}
            onCancel={() => setJoining(null)}
            onAdded={(write) => onJoined?.(write, joining)}
            onDone={finishJoin}
          />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
            {/* #701: the dialog is named by its title alone (an h2), not by
                the whole header row with the category chip and the buttons. */}
            <div className="flex items-center justify-between gap-3 pl-6 pr-4 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Chip
                  startContent={CATEGORY_ICONS[category]}
                  color={CATEGORY_COLORS[category]}
                  size="sm"
                  variant="flat"
                >
                  {t(`categories.${category}`)}
                </Chip>
                <ModalHeader as="h2" className="p-0 text-base font-semibold">
                  {descriptionOf
                    ? t(category === 'cigar' ? 'familyDrawer.form.titleCigar' : category === 'spirit' ? 'familyDrawer.form.titleSpirit' : 'familyDrawer.form.title')
                    : isEditing ? t('inventory.edit', category === 'cigar' ? { context: 'cigar' } : undefined) : t('inventory.add')}
                </ModalHeader>
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
            </div>

            <ModalBody className="p-0 flex flex-col sm:flex-row items-stretch gap-0 min-h-0 overflow-hidden flex-1">
              {/* Image panel — used to be `hidden sm:block`, i.e. entirely
                  unreachable on mobile (no way to edit/upload a photo at
                  all below the sm breakpoint). Now stacks on top, centered,
                  same compact size as the desktop column, instead of being
                  hidden. */}
              <div className="w-[170px] mx-auto sm:mx-0 shrink-0 border-b sm:border-b-0 sm:border-r border-divider px-4 py-5">
                <ItemImageSection
                  photoUrl={values.photoUrl ?? ''}
                  onPhotoChange={changePhoto}
                  category={category}
                  autoSearchQuery={[values.producer, values.name].filter(Boolean).join(' ')}
                  preloadedResults={prefetchedImages}
                  isAutoLoading={isAutoLoading}
                  suggestion={suggestedPhoto && {
                    image: suggestedPhoto,
                    hasMore: photoSuggestion!.index + 1 < photoSuggestion!.results.length,
                    onNext: () => showNextSuggestion(suggestionKey, 1),
                    onDismiss: () => showNextSuggestion(suggestionKey, photoSuggestion!.results.length),
                  }}
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
                    <h3 className="text-xs font-semibold text-foreground-500 mb-3">{t('inventory.step1')}</h3>

                    {/* Category chips */}
                    <div role="group" aria-label={t('inventory.fields.category')} className="flex flex-wrap gap-1.5 mb-4">
                      {CATEGORY_VALUES.map((cat) => (
                        <FilterChip
                          key={cat}
                          size="md"
                          startContent={CATEGORY_ICONS[cat]}
                          color={CATEGORY_COLORS[cat]}
                          selected={category === cat}
                          onPress={() => setValues((prev) => {
                            const wasCigar = prev.category === 'cigar';
                            // A number of bottles is not a number of cigars (FEAT-95): switching resets it.
                            if (!showsBottle || wasCigar === (cat === 'cigar')) return { ...prev, category: cat };
                            return { ...prev, category: cat, quantity: creationDefaults().quantity };
                          })}
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
                      <SingleSelect
                        label={t('nav.caves')}
                        variant="bordered"
                        size="sm"
                        // #701: alone on its row, it takes the row instead of leaving the right half empty.
                        className="sm:col-span-2"
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
                      </SingleSelect>
                      )}
                    </div>

                    {/* #471 (FEAT-97, ux-ui.md §10.4.1): under the name fields, never covering them. */}
                    {knownWines.length > 0 && (
                      <div className="mt-3">
                        <KnownWineBanner
                          matches={knownWines}
                          onAdd={setJoining}
                          onDistinct={() => setDistinctFrom((prev) => [...prev, ...knownWines.map((product) => product.id)])}
                          isDisabled={isSubmitting}
                          t={t}
                        />
                      </div>
                    )}
                    {knownWines.length === 0 && toldApart.length > 0 && (
                      <p data-testid="known-wine-distinct-noted" className="mt-3 text-sm text-foreground-500">
                        {t(category === 'cigar' ? 'knownWine.distinctNotedCigar' : category === 'spirit' ? 'knownWine.distinctNotedSpirit' : 'knownWine.distinctNoted')}
                      </p>
                    )}

                    {/* #471 (FEAT-92 c1, ux-ui.md §10.4.1): what is stored, with the
                        cellar — how many identical bottles, their size, the price of
                        ONE bottle and the day they were bought. Cigars: FEAT-95. */}
                    {/* Two by two, one by one on a phone: four in a row cut « Prix d'une bouteill… » (recette v3 of #471). */}
                    {showsBottle && !isCigar && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3" data-testid="inventory-bottles">
                        <ParsedNumberInput
                          data-testid="inventory-quantity-input"
                          label={t('inventory.fields.quantityBottles')}
                          variant="bordered"
                          size="sm"
                          isRequired
                          isInvalid={submitAttempted && invalidBottleCount}
                          errorMessage={t('inventory.validation.bottleCount', { max: MAX_COPIES })}
                          value={values.quantity}
                          onValueChange={(v) => setValues((prev) => ({
                            ...prev,
                            quantity: v,
                            // Several bottles form a group of full ones: only a single one is stored opened.
                            ...(v != null && v > 1 ? { isOpened: false, fillLevel: null, openedAt: null } : {}),
                          }))}
                          min={1} max={MAX_COPIES}
                        />
                        <Input
                          label={t('inventory.fields.bottleSize')}
                          variant="bordered"
                          size="sm"
                          value={values.bottleSize ?? ''}
                          onValueChange={(v) => setField('bottleSize', v)}
                        />
                        <ParsedNumberInput decimal
                          data-testid="inventory-unit-price-input"
                          label={t('inventory.fields.unitPrice')}
                          variant="bordered"
                          size="sm"
                          value={values.purchasePrice}
                          onValueChange={(v) => setField('purchasePrice', v)}
                          endContent={<span className="text-xs text-foreground-500">{currencySymbol(i18n.language)}</span>}
                        />
                        {/* D6: a day, kept as the YYYY-MM-DD text of the field, never a local Date. */}
                        <Input
                          data-testid="inventory-purchased-at-input"
                          label={t('inventory.fields.purchasedAt')}
                          type="date"
                          variant="bordered"
                          size="sm"
                          value={values.purchasedAt ?? ''}
                          onValueChange={(v) => setField('purchasedAt', v || null)}
                        />
                      </div>
                    )}
                    {/* FEAT-95: boxes of M cigars or single cigars, the price of ONE box or cigar. */}
                    {showsBottle && isCigar && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3" data-testid="inventory-cigars">
                        <CigarGroupFields
                          draft={cigarDraft}
                          submitted={submitAttempted}
                          t={t}
                          onChange={(draft) => {
                            setCigarStorage(draft.storage);
                            setValues((prev) => ({
                              ...prev,
                              quantity: draft.quantity ?? undefined,
                              cigarsPerBox: draft.cigarsPerBox ?? undefined,
                              // Only one box is stored opened.
                              ...(draft.storage !== 'boxes' || draft.quantity !== 1 ? { isOpened: false, cigarsLeft: null } : {}),
                            }));
                          }}
                        />
                        <ParsedNumberInput decimal
                          data-testid="inventory-unit-price-input"
                          label={t(cigarPriceKey(cigarStorage))}
                          variant="bordered"
                          size="sm"
                          value={values.purchasePrice}
                          onValueChange={(v) => setField('purchasePrice', v)}
                          endContent={<span className="text-xs text-foreground-500">{currencySymbol(i18n.language)}</span>}
                        />
                        <Input
                          data-testid="inventory-purchased-at-input"
                          label={t('inventory.fields.purchasedAt')}
                          type="date"
                          variant="bordered"
                          size="sm"
                          value={values.purchasedAt ?? ''}
                          onValueChange={(v) => setField('purchasedAt', v || null)}
                        />
                      </div>
                    )}
                  </div>

                  <Divider />

                  {/* Section 2: Category fields */}
                  <div>
                    <h3 className="text-xs font-semibold text-foreground-500 mb-3">{t('inventory.step2')}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                      {/* Wine essential */}
                      {isWine && (
                        <>
                          <ParsedNumberInput
                            data-testid="inventory-vintage-input"
                            {...halfField(t('inventory.fields.vintage'))}
                            variant="bordered"
                            size="sm"
                            value={values.vintage}
                            onValueChange={(v) => setField('vintage', v)}
                            description={t('inventory.fields.noVintage')}
                            min={1800} max={new Date().getFullYear()}
                          />
                          <SingleSelect
                            {...halfField(t('inventory.fields.color'))}
                            variant="bordered"
                            size="sm"
                            selectedKeys={values.color ? [values.color] : []}
                            onSelectionChange={(keys) => setField('color', Array.from(keys)[0] || undefined)}
                          >
                            {(['', ...WINE_COLORS]).map((c) => (
                              <SelectItem key={c}>{c ? t(`inventory.color.${c}`) : <em>—</em>}</SelectItem>
                            ))}
                          </SingleSelect>
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
                            {...halfField(t('inventory.fields.alcoholDegree'))}
                            variant="bordered"
                            size="sm"
                            value={values.alcoholDegree}
                            onValueChange={(v) => setField('alcoholDegree', v)}
                          />
                        </>
                      )}

                      {/* Sparkling essential */}
                      {isSparkling && (
                        <>
                          <ParsedNumberInput
                            data-testid="inventory-vintage-input"
                            {...halfField(t('inventory.fields.vintage'))}
                            variant="bordered"
                            size="sm"
                            value={values.vintage}
                            onValueChange={(v) => setField('vintage', v)}
                            description={t('inventory.fields.noVintage')}
                            min={1800} max={new Date().getFullYear()}
                          />
                          <SingleSelect
                            {...halfField(t('inventory.fields.sparklingType'))}
                            variant="bordered"
                            size="sm"
                            selectedKeys={values.sparklingType ? [values.sparklingType] : []}
                            onSelectionChange={(keys) => setField('sparklingType', Array.from(keys)[0] || undefined)}
                          >
                            {(['', ...SPARKLING_TYPES]).map((s) => (
                              <SelectItem key={s}>{s ? t(`inventory.sparklingTypes.${s}`) : <em>—</em>}</SelectItem>
                            ))}
                          </SingleSelect>
                          <SingleSelect
                            {...halfField(t('inventory.fields.sugarLevel'))}
                            // Third short field of the row: the whole phone row, the end of the computer one (review of #874).
                            className="col-span-2"
                            variant="bordered"
                            size="sm"
                            selectedKeys={values.sugarLevel ? [values.sugarLevel] : []}
                            onSelectionChange={(keys) => setField('sugarLevel', Array.from(keys)[0] || undefined)}
                          >
                            {(['', ...SUGAR_LEVELS]).map((s) => (
                              <SelectItem key={s}>{s ? t(`inventory.sugarLevels.${s}`) : <em>—</em>}</SelectItem>
                            ))}
                          </SingleSelect>
                        </>
                      )}

                      {/* Spirit essential */}
                      {isSpirit && (
                        <>
                          <div className="col-span-2">
                            <SingleSelect
                              label={t('inventory.fields.spiritType')}
                              variant="bordered"
                              size="sm"
                              selectedKeys={values.spiritType ? [values.spiritType] : []}
                              onSelectionChange={(keys) => setField('spiritType', Array.from(keys)[0] || undefined)}
                            >
                              {(['', 'whisky', 'rhum', 'gin', 'cognac', 'calvados', 'armagnac', 'vodka', 'tequila', 'mezcal', 'liqueur', 'other']).map((s) => (
                                <SelectItem key={s}>{s ? t(`inventory.spiritTypes.${s}`) : <em>—</em>}</SelectItem>
                              ))}
                            </SingleSelect>
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
                          {/* Alone in their grid: half a row each on a computer (recette n°5 quater of #847). */}
                          <Input
                            {...halfField(t('inventory.fields.format'), t('inventory.fields.manufactureYear'))}
                            className={cx(halfFieldSpan(t('inventory.fields.format'), t('inventory.fields.manufactureYear')), 'sm:col-span-2')}
                            variant="bordered"
                            size="sm"
                            value={values.format ?? ''}
                            onValueChange={(v) => setField('format', v)}
                          />
                          <ParsedNumberInput
                            {...halfField(t('inventory.fields.manufactureYear'), t('inventory.fields.format'))}
                            className={cx(halfFieldSpan(t('inventory.fields.manufactureYear'), t('inventory.fields.format')), 'sm:col-span-2')}
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
                            {...halfField(t('inventory.fields.peakMaturityFrom'))}
                            variant="bordered"
                            size="sm"
                            placeholder={t('inventory.fields.yearExample', { year: 2025 })}
                            value={values.peakMaturityFrom}
                            onValueChange={(v) => { setPeakWindowChecked(false); setField('peakMaturityFrom', v ?? null); }}
                            onBlur={() => setPeakWindowChecked(true)}
                            min={1800} max={2200}
                          />
                          <ParsedNumberInput
                            {...halfField(t('inventory.fields.peakMaturityTo'))}
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
                          <SingleSelect
                            className="col-span-2 sm:col-span-4"
                            label={t('inventory.fields.curveShape')}
                            description={t('inventory.fields.curveShapeHint')}
                            variant="bordered"
                            size="sm"
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
                          </SingleSelect>
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
                                {...halfField(t('inventory.fields.lotNumber'), t('inventory.fields.batchDate'))}
                                variant="bordered"
                                size="sm"
                                value={values.lotNumber ?? ''}
                                onValueChange={(v) => setField('lotNumber', v)}
                              />
                              <Input
                                {...halfField(t('inventory.fields.batchDate'), t('inventory.fields.lotNumber'))}
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
                                {...halfField(t('inventory.fields.caskNumber'), t('inventory.fields.caskProof'))}
                                variant="bordered"
                                size="sm"
                                value={values.caskNumber ?? ''}
                                onValueChange={(v) => setField('caskNumber', v)}
                              />
                              <ParsedNumberInput decimal
                                {...halfField(t('inventory.fields.caskProof'), t('inventory.fields.caskNumber'))}
                                variant="bordered"
                                size="sm"
                                value={values.caskProof}
                                onValueChange={(v) => setField('caskProof', v)}
                              />
                              {/* The last of the grid: ends its row on a computer (recette n°5 quater of #847). */}
                              <div className={cx('col-span-2 flex items-center', lastFieldDesktopSpan([
                                2,
                                halfFieldColumns(t('inventory.fields.caskNumber'), t('inventory.fields.caskProof')),
                                halfFieldColumns(t('inventory.fields.caskProof'), t('inventory.fields.caskNumber')),
                              ], 2))}>
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

                        {/* The price is with the number, above. */}
                        {showsBottle && (<>

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
                          {...halfField(t(isCigar ? cigarValueKey(cigarStorage) : 'inventory.fields.unitValue'))}
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

                        {/* Tags (#708): the wine's, typed like its grape varieties. */}
                        <div className="col-span-2 sm:col-span-4">
                          <ParsedInput
                            label={t('inventory.fields.tags')}
                            placeholder={t('inventory.fields.tagsHint')}
                            variant="bordered"
                            size="sm"
                            value={values.tags ?? []}
                            format={(list) => list.join(', ')}
                            parse={(text) => parseTags(text, initialValues?.tags)}
                            inputRef={tagsInput}
                            onValueChange={(list) => setField('tags', list)}
                            isInvalid={invalidTags}
                            errorMessage={t('inventory.validation.tags', tagLimits)}
                          />
                        </div>

                        {/* Wine/Sparkling optionals */}
                        {isWineOrSparkling && (
                          <>
                            <Input
                              {...halfField(t('inventory.fields.serviceTemp'))}
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
                                  {...halfField(t('inventory.fields.lotNumber'))}
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
                                  {...halfField(t('inventory.fields.baseYear'), t('inventory.fields.disgorgingDate'))}
                                  variant="bordered"
                                  size="sm"
                                  value={values.baseYear}
                                  onValueChange={(v) => setField('baseYear', v)}
                                  min={1800} max={2100}
                                />
                                <Input
                                  {...halfField(t('inventory.fields.disgorgingDate'), t('inventory.fields.baseYear'))}
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
                              {...halfField(t('inventory.fields.factoryCode'), t('inventory.fields.recommendedHumidity'))}
                              variant="bordered"
                              size="sm"
                              value={values.factoryCode ?? ''}
                              onValueChange={(v) => setField('factoryCode', v)}
                            />
                            <ParsedNumberInput decimal
                              {...halfField(t('inventory.fields.recommendedHumidity'), t('inventory.fields.factoryCode'))}
                              variant="bordered"
                              size="sm"
                              value={values.recommendedHumidity}
                              onValueChange={(v) => setField('recommendedHumidity', v)}
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

                        {/* Opened status — of a single bottle or box: several are stored full (a group) */}
                        {showsBottle && (isCigar ? canOpenBox : (values.quantity ?? 1) <= 1) && (
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
                                {values.isOpened ? '✓ ' : ''}{t(isCigar ? 'cigarGroup.openedBox' : 'inventory.fields.isOpened')}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* FEAT-95: an opened box counts the cigars left in it, a box is not filled. */}
                        {showsBottle && isCigar && opensBox && (
                          <ParsedNumberInput
                            data-testid="cigars-left-input"
                            {...halfField(t('cigarGroup.cigarsLeft'))}
                            variant="bordered"
                            size="sm"
                            isRequired
                            isInvalid={submitAttempted && invalidCigarsLeft}
                            errorMessage={t('cigarGroup.invalidCigarsLeft', { max: values.cigarsPerBox ?? MAX_COPIES })}
                            value={values.cigarsLeft ?? undefined}
                            onValueChange={(v) => setField('cigarsLeft', v ?? null)}
                            min={1} max={values.cigarsPerBox ?? MAX_COPIES}
                          />
                        )}

                        {showsBottle && values.isOpened && (
                          <>
                            {!isCigar && (
                            <div className="col-span-2 sm:col-span-4">
                              <p className="text-xs text-foreground-500 mb-1.5">{t('inventory.fields.fillLevel')}</p>
                              <div role="group" aria-label={t('inventory.fields.fillLevel')} className="flex flex-wrap gap-1.5">
                                {FILL_LEVELS.map(({ value, key }) => (
                                  <FilterChip
                                    key={value}
                                    color="warning"
                                    selected={values.fillLevel === value}
                                    onPress={() => setField('fillLevel', value)}
                                  >
                                    {t(key)}
                                  </FilterChip>
                                ))}
                              </div>
                            </div>
                            )}
                            <Input
                              {...halfField(t('inventory.fields.openedAt'), t('inventory.fields.reminderDate'))}
                              type="date"
                              variant="bordered"
                              size="sm"
                              value={typeof values.openedAt === 'string' ? values.openedAt.split('T')[0] : ''}
                              onValueChange={(v) => setField('openedAt', v || null)}
                            />
                            <Input
                              {...halfField(t('inventory.fields.reminderDate'), t('inventory.fields.openedAt'))}
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
                            // Recette n°5 quater of #847 (KO 5.1): the last field ends its row on a computer —
                            // after the fields of the category, laid out from the full row of the notes.
                            className={cx(halfFieldSpan(t('inventory.fields.reminderDate')), lastFieldDesktopSpan(
                              isWine ? [halfFieldColumns(t('inventory.fields.serviceTemp')), 4, halfFieldColumns(t('inventory.fields.lotNumber')), 1]
                                : isSparkling ? [
                                  halfFieldColumns(t('inventory.fields.serviceTemp')),
                                  halfFieldColumns(t('inventory.fields.baseYear'), t('inventory.fields.disgorgingDate')),
                                  halfFieldColumns(t('inventory.fields.disgorgingDate'), t('inventory.fields.baseYear')),
                                ]
                                : isSpirit ? [2, 2]
                                : isCigar ? [
                                  2,
                                  halfFieldColumns(t('inventory.fields.factoryCode'), t('inventory.fields.recommendedHumidity')),
                                  halfFieldColumns(t('inventory.fields.recommendedHumidity'), t('inventory.fields.factoryCode')),
                                  2,
                                ] : [],
                              halfFieldColumns(t('inventory.fields.reminderDate')),
                            ))}
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
