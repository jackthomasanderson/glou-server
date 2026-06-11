'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Chip, Divider, Input, Select, SelectItem, Autocomplete, AutocompleteItem,
} from '@heroui/react';
import { X, Save, Sparkles, ChevronDown, ChevronUp, Wine, Leaf } from 'lucide-react';
import { InventoryItem, InventoryCategory } from '@/lib/inventory/types';
import { useCellars } from '@/hooks/useCellars';
import { useCollections } from '@/hooks/useCollections';
import { Collection } from '@/lib/collections/types';
import { maturityReferenceClient } from '@/lib/maturity-references/client';
import { MaturitySuggestion } from '@/lib/maturity-references/types';
import { ProductAutocomplete } from './ProductAutocomplete';
import { ProductSuggestion } from '@/lib/inventory/productSearch';
import { ProducerAutocomplete } from './ProducerAutocomplete';
import { ImageResult } from './ImagePicker';
import { ItemImageSection } from './ItemImageSection';

interface InventoryFormProps {
  open: boolean;
  initialValues?: Partial<InventoryItem>;
  onSubmit: (values: Partial<InventoryItem>, collectionIds: string[]) => void;
  onClose: () => void;
  isSubmitting?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
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
  open, initialValues, onSubmit, onClose, isSubmitting = false, t,
}: InventoryFormProps) {
  const { data: cellars } = useCellars();
  const { data: allCollections } = useCollections();
  const [values, setValues] = useState<Partial<InventoryItem>>(initialValues ?? EMPTY_FORM);
  const [selectedCollections, setSelectedCollections] = useState<Collection[]>([]);
  const [showOptionals, setShowOptionals] = useState(false);
  const [suggestion, setSuggestion] = useState<MaturitySuggestion | null>(null);
  const [prefetchedImages, setPrefetchedImages] = useState<ImageResult[]>([]);
  const [isAutoLoading, setIsAutoLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditing = Boolean(initialValues?.id);

  useEffect(() => {
    if (open) {
      setValues(initialValues ?? EMPTY_FORM);
      setSelectedCollections(
        initialValues?.collections?.map(ic => ({
          id: ic.id, name: ic.name, color: ic.color, icon: ic.icon ?? undefined,
          userId: '', items: [], createdAt: '', updatedAt: '',
        })) ?? []
      );
      setShowOptionals(false);
      setSuggestion(null);
      setPrefetchedImages([]);
      setIsAutoLoading(false);
    }
  }, [open, initialValues]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.name, values.producer, values.photoUrl, isEditing]);

  const setField = (field: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const canSave = Boolean(values.category && values.name?.trim() && values.producer?.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSubmit(values, selectedCollections.map(c => c.id));
  };

  const hasPeakCategories = ['wine', 'sparkling'].includes(values.category ?? '');
  useEffect(() => {
    if (!hasPeakCategories || !values.category) { setSuggestion(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await maturityReferenceClient.suggest({
          category: values.category as 'wine' | 'sparkling' | 'spirit' | 'cigar',
          region: values.region ?? undefined,
          color: values.color ?? undefined,
          producer: values.producer ?? undefined,
          vintage: values.vintage ?? undefined,
        });
        setSuggestion(result);
      } catch { setSuggestion(null); }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.category, values.region, values.color, values.producer, values.vintage]);

  const applySuggestion = () => {
    if (!suggestion) return;
    setValues((prev) => ({
      ...prev,
      peakMaturityFrom: suggestion.peakMaturityFrom ?? prev.peakMaturityFrom,
      peakMaturityTo: suggestion.peakMaturityTo ?? prev.peakMaturityTo,
    }));
    setSuggestion(null);
  };

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
          <form onSubmit={handleSubmit} className="flex flex-col">
            <ModalHeader className="flex items-center justify-between gap-3 pr-4 pb-2">
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
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="p-1 rounded-lg hover:bg-default-100 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </ModalHeader>

            <ModalBody className="p-0 flex flex-row items-stretch gap-0">
              {/* Left image panel — hidden on mobile */}
              <div className="hidden sm:block w-[170px] shrink-0 border-r border-divider px-4 py-5">
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
              <div className="flex-1 min-w-0 px-5 py-5 overflow-y-auto">
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
                        selectedKeys={[values.cellarId === null ? 'none' : (values.cellarId ?? 'none')]}
                        onSelectionChange={(keys) => setField('cellarId', Array.from(keys)[0] === 'none' ? null : Array.from(keys)[0])}
                      >
                        {[
                          <SelectItem key="none"><em>{t('inventory.noCellar')}</em></SelectItem>,
                          ...(cellars ?? []).map((c) => <SelectItem key={c.id}>{c.name}</SelectItem>),
                        ]}
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
                            min={0} max={100}
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
                              min={0} max={100}
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
                    {suggestion && suggestion.peakMaturityFrom != null && suggestion.peakMaturityTo != null && (
                      <div className="mt-3 flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-xl px-3 py-2">
                        <Sparkles size={15} className="text-primary shrink-0" />
                        <p className="flex-1 text-xs text-primary-700">
                          <strong>{suggestion.reference.name}</strong>
                          {' — '}
                          {t('inventory.maturitySuggestion.window', {
                            from: suggestion.peakMaturityFrom,
                            to: suggestion.peakMaturityTo,
                          })}
                        </p>
                        <Button size="sm" variant="flat" color="primary" onPress={applySuggestion}>
                          {t('inventory.maturitySuggestion.apply')}
                        </Button>
                      </div>
                    )}
                  </div>

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
                        <div className="col-span-2">
                          <Autocomplete
                            label={t('inventory.fields.collection')}
                            variant="bordered"
                            size="sm"
                            inputValue=""
                            onSelectionChange={(key) => {
                              if (!key) return;
                              const col = allCollections?.find(c => c.id === key);
                              if (col && !selectedCollections.find(c => c.id === col.id)) {
                                setSelectedCollections(prev => [...prev, col]);
                              }
                            }}
                          >
                            {(allCollections ?? []).map((option) => (
                              <AutocompleteItem
                                key={option.id}
                                startContent={
                                  <span
                                    className="inline-block w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: option.color }}
                                  />
                                }
                              >
                                {option.icon ? `${option.icon} ` : ''}{option.name}
                              </AutocompleteItem>
                            ))}
                          </Autocomplete>
                          {selectedCollections.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {selectedCollections.map((col) => (
                                <Chip
                                  key={col.id}
                                  size="sm"
                                  onClose={() => setSelectedCollections(prev => prev.filter(c => c.id !== col.id))}
                                  style={{ backgroundColor: col.color, color: '#fff' }}
                                  className="text-[0.7rem]"
                                >
                                  {col.icon ? `${col.icon} ` : ''}{col.name}
                                </Chip>
                              ))}
                            </div>
                          )}
                        </div>

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

                        {/* Spirit optionals */}
                        {isSpirit && (
                          <>
                            <div className="col-span-2">
                              <Input
                                label={t('inventory.fields.caskType')}
                                variant="bordered"
                                size="sm"
                                value={values.caskType ?? ''}
                                onValueChange={(v) => setField('caskType', v)}
                              />
                            </div>
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

            <ModalFooter className="gap-2 pt-3">
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
