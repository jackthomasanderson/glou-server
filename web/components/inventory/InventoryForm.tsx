'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Divider, Input, Select, SelectItem,
} from '@heroui/react';
import { X, Save, Sparkles, ChevronDown, ChevronUp, Wine, Leaf, Camera, FlaskConical } from 'lucide-react';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
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

type CategoryColor = 'secondary' | 'primary' | 'default' | 'warning';

const CATEGORY_ICONS: Record<InventoryCategory, React.ReactElement> = {
  wine: <Wine size={14} />,
  sparkling: <Sparkles size={14} />,
  spirit: <span className="text-xs font-bold">S</span>,
  cigar: <Leaf size={14} />,
};

const CATEGORY_COLORS: Record<InventoryCategory, CategoryColor> = {
  wine: 'secondary',
  sparkling: 'primary',
  spirit: 'default',
  cigar: 'warning',
};

export function InventoryForm({
  open, initialValues, onSubmit, onClose, isSubmitting = false, t, onScanRequested,
}: InventoryFormProps) {
  const { data: cellars } = useCellars();
  const { data: allCollections } = useCollections();
  const isExpert = useExpertMode();
  const [values, setValues] = useState<Partial<InventoryItem>>(initialValues ?? EMPTY_FORM);
  const [selectedCollections, setSelectedCollections] = useState<Collection[]>([]);
  const [showOptionals, setShowOptionals] = useState(false);
  const [prefetchedImages, setPrefetchedImages] = useState<ImageResult[]>([]);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const imageDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditing = Boolean(initialValues?.id);

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
      setValues(initialValues ?? EMPTY_FORM);
      setSelectedCollections(
        initialValues?.collections?.map(ic => ({
          id: ic.id, name: ic.name, color: ic.color, icon: ic.icon ?? undefined,
          userId: '', items: [], createdAt: '', updatedAt: '',
        })) ?? []
      );
      setShowOptionals(false);
      setPrefetchedImages([]);
      setIsAutoLoading(false);
    }
  }

  useEffect(() => {
    if (isEditing || !values.name?.trim() || !values.producer?.trim() || values.photoUrl) return;
    if (imageDebounceRef.current) clearTimeout(imageDebounceRef.current);
    imageDebounceRef.current = setTimeout(async () => {
      setIsAutoLoading(true);
      try {
        const q = encodeURIComponent(`${values.producer} ${values.name}`.trim());
        const searchRes = await fetch(`/api/search/images?q=${q}`, { credentials: 'include' });
        const searchJson = (await searchRes.json()) as { data: ImageResult[] };
        const results = searchJson.data ?? [];
        setPrefetchedImages(results);
        if (results.length > 0) {
          const saveRes = await fetch('/api/search/images/save', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: results[0].url }),
          });
          const saveJson = (await saveRes.json()) as { data?: { path: string } };
          if (saveJson.data?.path) setField('photoUrl', saveJson.data.path);
        }
      } catch { /* ignore */ } finally {
        setIsAutoLoading(false);
      }
    }, 1200);
    return () => { if (imageDebounceRef.current) clearTimeout(imageDebounceRef.current); };
  }, [values.name, values.producer, values.photoUrl, isEditing]);

  const canSave = Boolean(values.category && values.name?.trim() && values.producer?.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    // alertStatus is recomputed server-side from peakMaturity — never send it as-is.
    // cellarId 'none' is a UI sentinel → null.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { alertStatus: _drop, ...rest } = values;
    const patch = {
      ...rest,
      cellarId: rest.cellarId === ('none' as string) || rest.cellarId === '' ? null : rest.cellarId,
    };
    onSubmit(patch, selectedCollections.map(c => c.id));
  };

  const hasPeakCategories = ['wine', 'sparkling'].includes(values.category ?? '');

  const category = (values.category ?? 'wine') as InventoryCategory;
  const isWine = category === 'wine';
  const isSparkling = category === 'sparkling';
  const isSpirit = category === 'spirit';
  const isCigar = category === 'cigar';
  const isWineOrSparkling = isWine || isSparkling;

  const numField = (val: string, fallback?: number) => (val ? Number(val) : fallback);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="2xl"
      radius="lg"
      backdrop="opaque"
      placement="center"
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
                  {isEditing ? t('inventory.edit') : t('inventory.add')}
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
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="p-1 rounded-lg hover:bg-default-100 transition-colors"
                  aria-label="Close"
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
              <div className="flex-1 min-w-0 min-h-0 px-5 py-5 overflow-y-auto">
                <div className="flex flex-col gap-6">

                  {/* Section 1: Identity */}
                  <div>
                    <p className="text-xs font-semibold text-default-500 mb-3">{t('inventory.step1')}</p>

                    {/* Category chips */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {(['wine', 'sparkling', 'spirit', 'cigar'] as InventoryCategory[]).map((cat) => (
                        <Chip
                          key={cat}
                          startContent={CATEGORY_ICONS[cat]}
                          color={category === cat ? CATEGORY_COLORS[cat] : 'default'}
                          variant={category === cat ? 'solid' : 'bordered'}
                          className="cursor-pointer"
                          onClick={() => setField('category', cat)}
                        >
                          {t(`categories.${cat}`)}
                        </Chip>
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
                        disabled={isEditing}
                      />
                      <ProducerAutocomplete
                        value={values.producer ?? ''}
                        onChange={(producer) => setField('producer', producer)}
                        category={values.category ?? 'wine'}
                        label={t('inventory.fields.producer')}
                        placeholder={t(`inventory.fields.producerPlaceholder.${category}`)}
                        required
                      />
                      <Select
                        label={t('nav.caves')}
                        variant="bordered"
                        size="sm"
                        items={[{ id: 'none', name: t('inventory.noCellar') }, ...(cellars ?? [])]}
                        selectedKeys={[values.cellarId === null ? 'none' : (values.cellarId ?? 'none')]}
                        onSelectionChange={(keys) => setField('cellarId', Array.from(keys)[0] === 'none' ? null : Array.from(keys)[0])}
                      >
                        {(item) => (
                          <SelectItem key={item.id}>
                            {item.id === 'none' ? <em>{item.name}</em> : item.name}
                          </SelectItem>
                        )}
                      </Select>
                    </div>
                  </div>

                  <Divider />

                  {/* Section 2: Category fields */}
                  <div>
                    <p className="text-xs font-semibold text-default-500 mb-3">{t('inventory.step2')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                      {/* Wine essential */}
                      {isWine && (
                        <>
                          <Input
                            label={t('inventory.fields.vintage')}
                            type="number"
                            variant="bordered"
                            size="sm"
                            value={String(values.vintage ?? '')}
                            onValueChange={(v) => setField('vintage', numField(v))}
                            description={t('inventory.fields.noVintage')}
                            min={1800} max={2100}
                          />
                          <Select
                            label={t('inventory.fields.color')}
                            variant="bordered"
                            size="sm"
                            selectedKeys={values.color ? [values.color] : []}
                            onSelectionChange={(keys) => setField('color', Array.from(keys)[0] || undefined)}
                          >
                            {(['', 'red', 'white', 'rosé', 'orange']).map((c) => (
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
                          <Input
                            label={t('inventory.fields.alcoholDegree')}
                            type="number"
                            variant="bordered"
                            size="sm"
                            value={String(values.alcoholDegree ?? '')}
                            onValueChange={(v) => setField('alcoholDegree', numField(v))}
                            endContent={<span className="text-xs text-default-400">%</span>}
                            min={0} max={100} step={0.1}
                          />
                        </>
                      )}

                      {/* Sparkling essential */}
                      {isSparkling && (
                        <>
                          <Input
                            label={t('inventory.fields.vintage')}
                            type="number"
                            variant="bordered"
                            size="sm"
                            value={String(values.vintage ?? '')}
                            onValueChange={(v) => setField('vintage', numField(v))}
                            description={t('inventory.fields.noVintage')}
                            min={1800} max={2100}
                          />
                          <Select
                            label={t('inventory.fields.sparklingType')}
                            variant="bordered"
                            size="sm"
                            selectedKeys={values.sparklingType ? [values.sparklingType] : []}
                            onSelectionChange={(keys) => setField('sparklingType', Array.from(keys)[0] || undefined)}
                          >
                            {(['', 'champagne', 'cremant', 'prosecco', 'cava', 'petnat', 'other']).map((s) => (
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
                            {(['', 'extra-brut', 'brut', 'extra-sec', 'sec', 'demi-sec', 'doux']).map((s) => (
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
                            <Input
                              label={t('inventory.fields.alcoholDegree')}
                              type="number"
                              variant="bordered"
                              size="sm"
                              isRequired
                              value={String(values.alcoholDegree ?? '')}
                              onValueChange={(v) => setField('alcoholDegree', numField(v))}
                              endContent={<span className="text-xs text-default-400">%</span>}
                              min={0} max={100} step={0.1}
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              label={t('inventory.fields.declaredAge')}
                              type="number"
                              variant="bordered"
                              size="sm"
                              value={String(values.declaredAge ?? '')}
                              onValueChange={(v) => setField('declaredAge', numField(v))}
                              endContent={<span className="text-xs text-default-400">{t('inventory.fields.declaredAgeUnit')}</span>}
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
                          <Input
                            label={t('inventory.fields.quantity')}
                            type="number"
                            variant="bordered"
                            size="sm"
                            isRequired
                            value={String(values.quantity ?? '')}
                            onValueChange={(v) => setField('quantity', numField(v))}
                            min={1}
                          />
                          <Input
                            label={t('inventory.fields.manufactureYear')}
                            type="number"
                            variant="bordered"
                            size="sm"
                            value={String(values.manufactureYear ?? '')}
                            onValueChange={(v) => setField('manufactureYear', numField(v))}
                            min={1900} max={2100}
                          />
                        </>
                      )}

                      {/* Peak maturity window */}
                      {isWineOrSparkling && (
                        <>
                          <div className="col-span-2 sm:col-span-4 flex items-center gap-2">
                            <div className="flex-1 h-px bg-divider" />
                            <span className="text-xs text-default-400 px-2">{t('inventory.fields.peakMaturity')}</span>
                            <div className="flex-1 h-px bg-divider" />
                          </div>
                          <Input
                            label={t('inventory.fields.peakMaturityFrom')}
                            type="number"
                            variant="bordered"
                            size="sm"
                            placeholder="ex: 2025"
                            value={String(values.peakMaturityFrom ?? '')}
                            onValueChange={(v) => setField('peakMaturityFrom', v ? Number(v) : null)}
                            min={1800} max={2200}
                          />
                          <Input
                            label={t('inventory.fields.peakMaturityTo')}
                            type="number"
                            variant="bordered"
                            size="sm"
                            placeholder="ex: 2030"
                            value={String(values.peakMaturityTo ?? '')}
                            onValueChange={(v) => setField('peakMaturityTo', v ? Number(v) : null)}
                            min={1800} max={2200}
                          />
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
                      onApply={(from, to) =>
                        setValues((prev) => ({
                          ...prev,
                          peakMaturityFrom: from ?? prev.peakMaturityFrom,
                          peakMaturityTo: to ?? prev.peakMaturityTo,
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
                              <Input
                                label={t('inventory.fields.caskProof')}
                                type="number"
                                variant="bordered"
                                size="sm"
                                value={String(values.caskProof ?? '')}
                                onValueChange={(v) => setField('caskProof', numField(v))}
                                endContent={<span className="text-xs text-default-400">%</span>}
                                min={0} max={100} step={0.1}
                              />
                              <div className="flex items-center">
                                <Chip
                                  variant={values.isSingleCask ? 'solid' : 'bordered'}
                                  color={values.isSingleCask ? 'primary' : 'default'}
                                  className="cursor-pointer"
                                  onClick={() => setField('isSingleCask', !values.isSingleCask)}
                                >
                                  {t('inventory.fields.isSingleCask')}
                                </Chip>
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
                        <Input
                          label={t('inventory.fields.purchasePrice')}
                          type="number"
                          variant="bordered"
                          size="sm"
                          value={String(values.purchasePrice ?? '')}
                          onValueChange={(v) => setField('purchasePrice', numField(v))}
                          endContent={<span className="text-xs text-default-400">€</span>}
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
                        <Input
                          label={t('inventory.fields.estimatedValue')}
                          type="number"
                          variant="bordered"
                          size="sm"
                          value={String(values.estimatedValue ?? '')}
                          onValueChange={(v) => setField('estimatedValue', numField(v))}
                          endContent={<span className="text-xs text-default-400">€</span>}
                        />

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
                            <Input
                              label={t('inventory.fields.bottleSize')}
                              variant="bordered"
                              size="sm"
                              value={values.bottleSize ?? ''}
                              onValueChange={(v) => setField('bottleSize', v)}
                            />
                            <Input
                              label={t('inventory.fields.serviceTemp')}
                              variant="bordered"
                              size="sm"
                              value={values.serviceTemp ?? ''}
                              onValueChange={(v) => setField('serviceTemp', v)}
                            />
                            {isWine && (
                              <>
                                <div className="col-span-2 sm:col-span-4">
                                  <Input
                                    label={t('inventory.fields.grapeVarieties')}
                                    placeholder={t('inventory.fields.grapeVarietiesHint')}
                                    variant="bordered"
                                    size="sm"
                                    value={(values.grapeVarieties ?? []).join(', ')}
                                    onValueChange={(v) =>
                                      setField('grapeVarieties', v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])
                                    }
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
                                  <Chip
                                    variant={values.needsAeration ? 'solid' : 'bordered'}
                                    color={values.needsAeration ? 'primary' : 'default'}
                                    className="cursor-pointer"
                                    onClick={() => setField('needsAeration', !values.needsAeration)}
                                  >
                                    {t('inventory.fields.needsAeration')}
                                  </Chip>
                                </div>
                              </>
                            )}
                            {isSparkling && (
                              <>
                                <Input
                                  label={t('inventory.fields.baseYear')}
                                  type="number"
                                  variant="bordered"
                                  size="sm"
                                  value={String(values.baseYear ?? '')}
                                  onValueChange={(v) => setField('baseYear', numField(v))}
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
                            <Input
                              label={t('inventory.fields.bottleSize')}
                              variant="bordered"
                              size="sm"
                              value={values.bottleSize ?? ''}
                              onValueChange={(v) => setField('bottleSize', v)}
                            />
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
                            <Input
                              label={t('inventory.fields.recommendedHumidity')}
                              type="number"
                              variant="bordered"
                              size="sm"
                              value={String(values.recommendedHumidity ?? '')}
                              onValueChange={(v) => setField('recommendedHumidity', numField(v))}
                              endContent={<span className="text-xs text-default-400">%</span>}
                              min={50} max={100}
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

                        {/* Opened status */}
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
                                  setField('openedAt', new Date().toISOString().split('T')[0]);
                                }
                              }}
                            >
                              {values.isOpened ? '✓ ' : ''}{t('inventory.fields.isOpened')}
                            </Button>
                          </div>
                        </div>

                        {values.isOpened && (
                          <>
                            <div className="col-span-2 sm:col-span-4">
                              <p className="text-xs text-default-500 mb-1.5">{t('inventory.fields.fillLevel')}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {([100, 75, 50, 25, 0] as const).map((val) => (
                                  <Chip
                                    key={val}
                                    size="sm"
                                    variant={values.fillLevel === val ? 'solid' : 'bordered'}
                                    color={values.fillLevel === val ? 'warning' : 'default'}
                                    className="cursor-pointer"
                                    onClick={() => setField('fillLevel', val)}
                                  >
                                    {t(`inventory.fillLevels.${val === 100 ? 'full' : val === 75 ? 'threeQuarters' : val === 50 ? 'half' : val === 25 ? 'quarter' : 'empty'}`)}
                                  </Chip>
                                ))}
                              </div>
                            </div>
                            <Input
                              label={t('inventory.fields.openedAt')}
                              type="date"
                              variant="bordered"
                              size="sm"
                              value={typeof values.openedAt === 'string' ? values.openedAt.split('T')[0] : ''}
                              onValueChange={(v) => setField('openedAt', v)}
                            />
                            <Input
                              label={t('inventory.fields.reminderDate')}
                              type="date"
                              variant="bordered"
                              size="sm"
                              value={typeof values.reminderDate === 'string' ? values.reminderDate.split('T')[0] : ''}
                              onValueChange={(v) => setField('reminderDate', v)}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ModalBody>

            <ModalFooter className="gap-2 pt-3 shrink-0">
              <Button variant="bordered" onPress={onClose} isDisabled={isSubmitting}>
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                color="primary"
                startContent={<Save size={15} />}
                isDisabled={!canSave || isSubmitting}
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
    </Modal>
  );
}
