'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Textarea, Select, SelectItem, Autocomplete, AutocompleteItem, RadioGroup, Radio,
} from '@heroui/react';
import { FlaskConical } from 'lucide-react';
import { StarRating } from './StarRating';
import { useForm, Controller } from 'react-hook-form';
import { TastingFormValues, TastingReadiness } from '@/lib/tastings/types';
import { useCreateTasting, useUpdateTasting } from '@/hooks/useTastings';
import { REATTACH_REFUSALS, useInventoryItemLookup, useUpdateInventoryItem } from '@/hooks/useInventory';
import { useProducts } from '@/hooks/useProducts';
import { useCellars } from '@/hooks/useCellars';
import { ServiceRecommendations } from './ServiceRecommendations';
import { useTranslation } from 'react-i18next';
import { InventoryCategory, InventoryItem } from '@/lib/inventory/types';
import { CATEGORY_VALUES } from '@shared/inventory';
import { unitKind } from '@shared/units';
import { familyLines, formatPurchaseDay, lineParts, type LineContext } from '@/lib/products/lines';
import { formatCurrency, formatDate } from '@/lib/format';
import { isValidVintage, parseYear, tastingLinePreset, tastingPayload, wineOptionLabel } from '@/lib/tastings/onWine';
import { useExpertMode } from '@/hooks/useExpertMode';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { DiscardChangesDialog } from '@/components/ui/DiscardChangesDialog';
import { notifyError } from '@/lib/toast';
import {
  applyStockChoice, cellQuestionFor, choiceMove, smokeOutcome, stockChoicesFor, type StockChoice,
} from '@/lib/tastings/stockChoice';
import { cellAskOf, type CellAsk } from '@/lib/products/cells';
import { SLOT_CHANGED, SLOT_CHOICE_REQUIRED, type SlotChoiceFields } from '@shared/product';
import { WhichCellDialog } from '@/components/inventory/WhichCellDialog';
import { blankTastingValues } from '@/lib/tastings/formValues';
import { SingleSelect } from '@/components/ui/SingleSelect';

const CONTEXTS = ['solo', 'amis', 'restaurant', 'dégustation', 'cadeau'];
const READINESS_VALUES: TastingReadiness[] = ['TOO_YOUNG', 'PERFECT', 'PEAK', 'PAST'];

interface TastingFormProps {
  open: boolean;
  onClose: () => void;
  /** The bottle tasted, preset (a line of the cellar). */
  initialItemId?: string;
  /** #471 (FEAT-107): the wine tasted, fixed (its drawer). */
  initialProductId?: string;
  // FEAT-09: pre-fills the food pairing field when the form is opened from
  // the "Consommer maintenant" action of the dish → bottles pairing explorer.
  initialFoodPairing?: string;
  editNote?: { id: string; values: TastingFormValues };
  /**
   * FEAT-93: opened from a wine's drawer opened on a cell of the plan — the
   * line holding it and its slot. Updating the stock of that line takes the
   * bottle of that cell, without asking "De quelle case ?" (decision 77).
   */
  fromCell?: { itemId: string; slotId: string };
}

export function TastingForm({ open, onClose, initialItemId, initialProductId, initialFoodPairing, editNote, fromCell }: TastingFormProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: products } = useProducts({ enabled: open });
  const { data: cellars } = useCellars();
  const createMutation = useCreateTasting();
  const updateMutation = useUpdateTasting();
  const updateInventory = useUpdateInventoryItem();
  const lookUpItem = useInventoryItemLookup();
  const isExpert = useExpertMode();
  // The tasted item as it was when the stock question was asked, and the
  // tasting it was noted with (it follows a bottle taken off its group).
  const [stockQuestion, setStockQuestion] = useState<{ itemId: string; item?: InventoryItem; tastingId: string } | null>(null);
  // FEAT-93 (decision #471 point 79): "De quelle case ?" after a stock choice on a placed line.
  const [cellQuestion, setCellQuestion] = useState<{ choice: StockChoice; ask: CellAsk } | null>(null);
  // #471 (FEAT-107): a wine named instead of picked ("not in the list"), and
  // whether the tasting is of a bottle of the cellar.
  const [naming, setNaming] = useState(false);
  const [onBottle, setOnBottle] = useState(true);
  // The vintage as typed: "20" on the way to "2020" stays on screen.
  const [vintageText, setVintageText] = useState('');
  // What its rule checks: react-hook-form keeps the rule of the field's first
  // render, so a rule reading the state saw "202" still once "2020" was typed
  // (acceptance run v3 of #471). Set in event handlers only.
  const typedVintage = useRef('');
  const typeVintage = (text: string) => { typedVintage.current = text; setVintageText(text); };

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<TastingFormValues>({
    defaultValues: blankTastingValues(initialItemId, initialFoodPairing, initialProductId),
  });

  const watchedItemId = watch('itemId');
  const watchedProductId = watch('productId');
  const namedCategory = watch('wine.category') ?? 'wine';

  // The form is filled when the dialog opens or turns to another tasting, not
  // on every render of the parent: a background refetch rebuilds `editNote`
  // and used to wipe what was being typed (#642). Adjusted during render
  // (React's documented pattern), applied by the effect below.
  const formSession = open ? JSON.stringify([editNote?.id, initialItemId, initialProductId, initialFoodPairing]) : null;
  const [prevFormSession, setPrevFormSession] = useState<string | null>(null);
  const [startValues, setStartValues] = useState<TastingFormValues | null>(null);
  if (formSession !== prevFormSession) {
    setPrevFormSession(formSession);
    if (formSession !== null) {
      // A copy: a draft typed in an earlier session never leaks into this one.
      setStartValues(editNote ? { ...editNote.values } : blankTastingValues(initialItemId, initialFoodPairing, initialProductId));
      setNaming(false);
      setOnBottle(true);
      setVintageText('');
    }
  }

  useEffect(() => {
    if (startValues) reset(startValues);
  }, [startValues, reset]);

  // A bottle given without its wine (pairing explorer, consumption plan): its wine.
  const productOfItem = useMemo(
    () => (watchedItemId ? products?.find((product) => product.items.some((item) => item.id === watchedItemId))?.id : undefined),
    [products, watchedItemId],
  );
  useEffect(() => {
    if (!watchedProductId && productOfItem && !editNote) setValue('productId', productOfItem);
  }, [watchedProductId, productOfItem, editNote, setValue]);
  const product = products?.find((candidate) => candidate.id === (watchedProductId ?? productOfItem));

  // §10.3: the lines of the wine in the cellar, as its drawer shows them.
  const cellarName = useCallback((id: string) => cellars?.find((cellar) => cellar.id === id)?.name, [cellars]);
  const lineCtx: LineContext = useMemo(() => ({
    kind: unitKind(product?.category ?? 'wine'),
    t,
    cellarName,
    formatPrice: (value) => formatCurrency(value, lang),
    formatDay: (day) => formatPurchaseDay(day, lang),
    formatDate: (iso) => formatDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' }),
  }), [product?.category, t, cellarName, lang]);
  const lines = useMemo(() => familyLines(product?.items ?? [], cellarName), [product?.items, cellarName]);
  // A wine with no bottle in the cellar is tasted elsewhere: nothing to ask.
  const asksBottle = !editNote && !naming && lines.inCellar.length > 0;
  const tastesBottle = asksBottle && onBottle;
  const preset = tastingLinePreset(lines.inCellar, watchedItemId);
  useEffect(() => {
    // The line preset when the wine has one obvious line (an opened bottle, a single line).
    if (asksBottle && preset && preset.id !== watchedItemId) setValue('itemId', preset.id);
  }, [asksBottle, preset, watchedItemId, setValue]);

  // isSubmitting also covers reading the tasted item's stock after the save.
  const isSaving = createMutation.isPending || updateMutation.isPending || isSubmitting;

  // ISSUE_119: once a field has been edited, the modal can no longer be
  // dismissed by a backdrop click or Escape, and the explicit cancel
  // control asks for confirmation before throwing the note away.
  const guard = useUnsavedChangesGuard({
    isOpen: open,
    isDirty,
    onClose,
    isLocked: isSaving,
  });

  const onSubmit = async (values: TastingFormValues) => {
    try {
      if (editNote) {
        await updateMutation.mutateAsync({ id: editNote.id, data: tastingPayload(values, { kind: 'edit', itemId: editNote.values.itemId }) });
        onClose();
      } else {
        const note = await createMutation.mutateAsync(tastingPayload(values, naming
          ? { kind: 'named' }
          // A wine whose lines are not known (list not loaded): the bottle given stays.
          : { kind: 'listed', onBottle: asksBottle ? onBottle : !product }));
        // The stock question is skipped for an item with nothing to update
        // (empty box, finished bottle) or whose stock could not be read. A
        // wine tasted without a bottle (FEAT-87) has no item to ask about.
        const tastedItem = note.itemId ? await lookUpItem(note.itemId) : undefined;
        if (note.itemId && tastedItem && stockChoicesFor(tastedItem).length > 0) {
          setStockQuestion({ itemId: note.itemId, item: tastedItem, tastingId: note.id });
        } else {
          onClose();
        }
      }
    } catch {
      // error displayed via mutation.error below
    }
  };

  const handleStockChoice = async (choice: StockChoice, cell?: SlotChoiceFields) => {
    // FEAT-93: a line of several placed on the plan — which cell, first (the tasting is saved already).
    const ask = stockQuestion && !cell ? cellQuestionFor(choice, stockQuestion.item) : null;
    // The cell touched on the plan already says which bottle, when it is of the line tasted.
    if (ask && stockQuestion && fromCell?.itemId === stockQuestion.itemId && ask.slots.some((slot) => slot.id === fromCell.slotId)) {
      await handleStockChoice(choice, { fromSlotId: fromCell.slotId });
      return;
    }
    if (ask) {
      setCellQuestion({ choice, ask });
      return;
    }
    const canClose = stockQuestion
      ? await applyStockChoice(
          choice,
          stockQuestion.item,
          // FEAT-107 c3: "Bue" on a bottle of a ×6 leaves a ×5 and a finished bottle holding the tasting.
          (patch) => updateInventory.mutateAsync({
            id: stockQuestion.itemId,
            patch: { ...patch, tastingId: stockQuestion.tastingId },
            quiet: [SLOT_CHOICE_REQUIRED, SLOT_CHANGED],
          }),
          (error) => {
            // The line's cells as the API knows them: asked (again).
            const asked = cellAskOf(error);
            if (asked) {
              if (error instanceof Error && error.message === SLOT_CHANGED) notifyError('stockLine.errors.slotChanged');
              setCellQuestion({ choice, ask: asked });
              return;
            }
            // A refusal with its own message (a cigar already smoked…) was told by the mutation.
            if (!(error instanceof Error && error.message in REATTACH_REFUSALS)) notifyError('tastings.stockUpdate.error');
          },
          cell,
        )
      : true;
    if (!canClose) return;
    setCellQuestion(null);
    setStockQuestion(null);
    onClose();
  };

  const wineOptions = products ?? [];
  const isCigar = (naming ? namedCategory : product?.category) === 'cigar';
  const hasError = !!(createMutation.error || updateMutation.error);
  const showStockDialog = !!stockQuestion;
  const stockChoices = stockQuestion ? stockChoicesFor(stockQuestion.item) : [];
  const smoke = smokeOutcome(stockQuestion?.item);

  return (
    <>
      <ResponsiveModal
        isOpen={open && !showStockDialog && !guard.isConfirmOpen}
        onClose={guard.requestClose}
        {...guard.dismissProps}
        size="md"
        radius="lg"
        backdrop="opaque"
        placement="top"
        scrollBehavior="inside"
      >
        <ModalContent>
          {() => (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full min-h-0 overflow-hidden">
              <ModalHeader>
                {editNote ? t('tastings.edit') : t('tastings.create')}
              </ModalHeader>
              <ModalBody className="flex flex-col gap-4 min-h-0">
                {/* Error banner */}
                {hasError && (
                  <div role="alert" className="rounded-lg bg-danger-50 border border-danger-200 text-danger px-3 py-2 text-sm">
                    {t('tastings.errors.saveFailed')}
                  </div>
                )}

                {/* #471 (FEAT-107): the wine tasted, picked from the list or named */}
                {naming ? (
                  <div className="flex flex-col gap-3" data-testid="tasting-named-wine">
                    <p className="text-xs text-foreground-500">{t('tastingWine.namedHint')}</p>
                    <Controller
                      name="wine.category"
                      control={control}
                      render={({ field }) => (
                        <SingleSelect
                          label={t('inventory.fields.category')}
                          selectedKeys={[field.value ?? 'wine']}
                          onSelectionChange={(keys) => field.onChange((Array.from(keys)[0] as InventoryCategory) ?? 'wine')}
                          variant="bordered"
                        >
                          {CATEGORY_VALUES.map((category) => (
                            <SelectItem key={category}>{t(`categories.${category}`)}</SelectItem>
                          ))}
                        </SingleSelect>
                      )}
                    />
                    <Controller
                      name="wine.producer"
                      control={control}
                      rules={{ validate: (value) => !naming || !!value?.trim() || t('tastings.errors.required') }}
                      render={({ field }) => (
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          label={`${t('inventory.fields.producer')} *`}
                          isInvalid={!!errors.wine?.producer}
                          errorMessage={errors.wine?.producer?.message}
                          variant="bordered"
                        />
                      )}
                    />
                    <Controller
                      name="wine.name"
                      control={control}
                      rules={{ validate: (value) => !naming || !!value?.trim() || t('tastings.errors.required') }}
                      render={({ field }) => (
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          label={`${t('inventory.fields.name')} *`}
                          isInvalid={!!errors.wine?.name}
                          errorMessage={errors.wine?.name?.message}
                          variant="bordered"
                        />
                      )}
                    />
                    {isCigar ? (
                      <Controller
                        name="wine.format"
                        control={control}
                        render={({ field }) => (
                          <Input {...field} value={field.value ?? ''} label={t('tastingWine.vitola')} variant="bordered" />
                        )}
                      />
                    ) : (
                      <Controller
                        name="wine.vintage"
                        control={control}
                        rules={{ validate: () => isValidVintage(typedVintage.current) || t('tastingWine.vintageInvalid', { year: new Date().getFullYear() }) }}
                        render={({ field }) => (
                          <Input
                            inputMode="numeric"
                            maxLength={4}
                            value={vintageText}
                            onValueChange={(text) => { typeVintage(text); field.onChange(parseYear(text)); }}
                            label={t('inventory.fields.vintage')}
                            isInvalid={!!errors.wine?.vintage}
                            errorMessage={errors.wine?.vintage?.message}
                            variant="bordered"
                          />
                        )}
                      />
                    )}
                    <Button
                      size="sm"
                      variant="light"
                      className="self-start"
                      onPress={() => { setNaming(false); setValue('wine', undefined); }}
                    >
                      {t('tastingWine.pickFromList')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <Controller
                      name="productId"
                      control={control}
                      rules={{ validate: (value) => naming || !!editNote || !!value || !!watchedItemId || t('tastings.errors.required') }}
                      render={({ field }) => (
                        <Autocomplete
                          label={`${t('tastingWine.wine')} *`}
                          isDisabled={!!editNote || !!initialProductId || !!initialItemId}
                          isInvalid={!!errors.productId}
                          errorMessage={errors.productId?.message}
                          defaultItems={wineOptions}
                          selectedKey={field.value ?? productOfItem ?? null}
                          onSelectionChange={(key) => {
                            field.onChange(key ? String(key) : undefined);
                            // Another wine: its own bottles, its own preset.
                            setValue('itemId', undefined);
                            setOnBottle(true);
                          }}
                          variant="bordered"
                        >
                          {(option) => <AutocompleteItem key={option.id}>{wineOptionLabel(option)}</AutocompleteItem>}
                        </Autocomplete>
                      )}
                    />
                    {!editNote && !initialProductId && !initialItemId && (
                      <Button
                        size="sm"
                        variant="light"
                        className="self-start"
                        onPress={() => {
                          setNaming(true);
                          typeVintage('');
                          setValue('productId', undefined);
                          setValue('itemId', undefined);
                          setValue('wine', { category: 'wine', producer: '', name: '', vintage: null, format: null });
                        }}
                      >
                        {t('tastingWine.notListed')}
                      </Button>
                    )}
                  </div>
                )}

                {/* FEAT-107: on a bottle of the cellar, or tasted elsewhere (the stock untouched) */}
                {asksBottle && (
                  <RadioGroup
                    label={t(isCigar ? 'tastingWine.onCigar' : 'tastingWine.onBottle')}
                    orientation="horizontal"
                    value={onBottle ? 'yes' : 'no'}
                    onValueChange={(value) => setOnBottle(value === 'yes')}
                    size="sm"
                  >
                    <Radio value="yes">{t('tastingWine.yes')}</Radio>
                    <Radio value="no">{t('tastingWine.elsewhere')}</Radio>
                  </RadioGroup>
                )}
                {tastesBottle && (
                  <Controller
                    name="itemId"
                    control={control}
                    rules={{ validate: (value) => !tastesBottle || !!value || t('tastings.errors.required') }}
                    render={({ field }) => (
                      <SingleSelect
                        label={`${t(isCigar ? 'tastingWine.whichCigars' : 'tastingWine.whichBottle')} *`}
                        selectedKeys={field.value ? [field.value] : []}
                        onSelectionChange={(keys) => field.onChange((Array.from(keys)[0] as string) ?? undefined)}
                        isInvalid={!!errors.itemId}
                        errorMessage={errors.itemId?.message}
                        variant="bordered"
                      >
                        {lines.inCellar.map((line) => (
                          <SelectItem key={line.id}>{lineParts(line, lineCtx).join(' · ')}</SelectItem>
                        ))}
                      </SingleSelect>
                    )}
                  />
                )}

                {/* Service recommendations */}
                {product && <ServiceRecommendations item={product} />}

                {/* Date */}
                <Controller
                  name="tastedAt"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      type="date"
                      label={t('tastings.fields.tastedAt')}
                      variant="bordered"
                      labelPlacement="outside"
                    />
                  )}
                />

                {/* Star rating */}
                <div>
                  <p className="text-xs text-foreground-500 mb-1">{t('tastings.fields.rating')}</p>
                  <Controller
                    name="rating"
                    control={control}
                    render={({ field }) => (
                      <StarRating label={t('tastings.fields.rating')} value={field.value ?? null} onChange={field.onChange} />
                    )}
                  />
                </div>

                {/* Readiness */}
                <Controller
                  name="readiness"
                  control={control}
                  render={({ field }) => (
                    <Select
                      // select-may-empty: an optional field without a "—" choice: emptying it clears the answer.
                      label={t('tastings.fields.readiness')}
                      selectedKeys={field.value ? [field.value] : []}
                      onSelectionChange={(keys) => {
                        const val = (Array.from(keys)[0] as TastingReadiness) ?? null;
                        field.onChange(val || null);
                      }}
                      variant="bordered"
                    >
                      {READINESS_VALUES.map((r) => (
                        <SelectItem key={r}>{t(`tastings.readiness.${r}`)}</SelectItem>
                      ))}
                    </Select>
                  )}
                />

                {/* Context */}
                <Controller
                  name="context"
                  control={control}
                  render={({ field }) => (
                    <Select
                      // select-may-empty: an optional field without a "—" choice: emptying it clears the answer.
                      label={t('tastings.fields.context')}
                      selectedKeys={field.value ? [field.value] : []}
                      onSelectionChange={(keys) => {
                        const val = Array.from(keys)[0] as string ?? '';
                        field.onChange(val);
                      }}
                      variant="bordered"
                    >
                      {CONTEXTS.map((c) => (
                        <SelectItem key={c}>{c}</SelectItem>
                      ))}
                    </Select>
                  )}
                />

                {/* Notes */}
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <Textarea
                      {...field}
                      label={t('tastings.fields.notes')}
                      minRows={4}
                      variant="bordered"
                      radius="md"
                      labelPlacement="outside"
                    />
                  )}
                />

                {/* Food pairing */}
                <Controller
                  name="foodPairing"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      label={t('tastings.fields.foodPairing')}
                      variant="bordered"
                    />
                  )}
                />

                {/* Structured tasting grid (data-model audit, Task 2) —
                    "Mode expert" only. Extended to every category, not just
                    wine: the vocabulary (robe/nez/bouche/tanin/acidité/
                    longueur) reads as wine-specific but the same structured
                    slots are useful for any spirit or cigar tasting note too
                    (color, nose, palate, "bite"/finish) — left optional, so
                    nothing forces a taster to fill fields that don't fit
                    their product. Lives here (TastingNote) rather than on
                    the bottle itself: a tasting perception is tied to THIS
                    tasting event, not a permanent property of the bottle. */}
                {isExpert && (
                  <div className="flex flex-col gap-3 pt-3 border-t border-divider">
                    <div className="flex items-center gap-1.5">
                      <FlaskConical size={14} className="text-primary" />
                      <p className="text-xs font-semibold text-primary">{t('tastings.expertSection.title')}</p>
                    </div>
                    <Controller
                      name="robe"
                      control={control}
                      render={({ field }) => (
                        <Input {...field} value={field.value ?? ''} label={t('tastings.fields.robe')} variant="bordered" />
                      )}
                    />
                    <Controller
                      name="nez"
                      control={control}
                      render={({ field }) => (
                        <Input {...field} value={field.value ?? ''} label={t('tastings.fields.nez')} variant="bordered" />
                      )}
                    />
                    <Controller
                      name="bouche"
                      control={control}
                      render={({ field }) => (
                        <Input {...field} value={field.value ?? ''} label={t('tastings.fields.bouche')} variant="bordered" />
                      )}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Controller
                        name="tanin"
                        control={control}
                        render={({ field }) => (
                          <Input
                            type="number" min={1} max={5}
                            value={field.value != null ? String(field.value) : ''}
                            onValueChange={(v) => field.onChange(v ? Number(v) : null)}
                            label={t('tastings.fields.tanin')}
                            variant="bordered"
                          />
                        )}
                      />
                      <Controller
                        name="acidite"
                        control={control}
                        render={({ field }) => (
                          <Input
                            type="number" min={1} max={5}
                            value={field.value != null ? String(field.value) : ''}
                            onValueChange={(v) => field.onChange(v ? Number(v) : null)}
                            label={t('tastings.fields.acidite')}
                            variant="bordered"
                          />
                        )}
                      />
                      <Controller
                        name="longueurBouche"
                        control={control}
                        render={({ field }) => (
                          <Input
                            type="number" min={0} max={600}
                            value={field.value != null ? String(field.value) : ''}
                            onValueChange={(v) => field.onChange(v ? Number(v) : null)}
                            label={t('tastings.fields.longueurBouche')}
                            variant="bordered"
                            endContent={<span className="text-xs text-foreground-500">s</span>}
                          />
                        )}
                      />
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  variant="light"
                  onPress={guard.requestClose}
                  isDisabled={isSaving}
                >
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  type="submit"
                  isLoading={isSaving}
                  isDisabled={isSaving}
                >
                  {isSaving ? t('actions.saving') : t('actions.save')}
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </ResponsiveModal>

      {/* FEAT-77: Stock update suggestion after tasting creation */}
      <ResponsiveModal
        isOpen={showStockDialog && !cellQuestion}
        onClose={() => handleStockChoice('ignore')}
        size="sm"
        radius="lg"
        backdrop="opaque"
        placement="center"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="text-base">
                {t('tastings.stockUpdate.title')}
              </ModalHeader>
              <ModalBody className="pb-1">
                <p className="text-sm text-foreground-500">
                  {t('tastings.stockUpdate.description', isCigar ? { context: 'cigar' } : undefined)}
                </p>
              </ModalBody>
              <ModalFooter className="flex-col gap-2">
                {stockChoices.map((choice) => (
                  <Button
                    key={choice}
                    color={choice === 'consumed' ? 'danger' : 'warning'}
                    variant="flat"
                    fullWidth
                    onPress={() => handleStockChoice(choice)}
                    isLoading={updateInventory.isPending}
                  >
                    {choice === 'smokeOne' && smoke
                      ? t(`tastings.stockUpdate.smokeOne.${smoke.kind}`, { count: smoke.left })
                      : t(`tastings.stockUpdate.${choice}`)}
                  </Button>
                ))}
                <Button
                  variant="light"
                  fullWidth
                  onPress={() => handleStockChoice('ignore')}
                >
                  {t('tastings.stockUpdate.ignore')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>

      {cellQuestion && stockQuestion && (
        <WhichCellDialog
          key={cellQuestion.ask.slots.map((slot) => slot.id).join('|') + cellQuestion.ask.unplaced}
          wine={product ? wineOptionLabel(product) : undefined}
          line={(() => {
            const line = lines.inCellar.find((item) => item.id === stockQuestion.itemId);
            return line ? lineParts(line, lineCtx).join(' · ') : '';
          })()}
          ask={cellQuestion.ask}
          move={choiceMove(cellQuestion.choice)}
          confirmLabel={cellQuestion.choice === 'smokeOne' && smoke
            ? t(`tastings.stockUpdate.smokeOne.${smoke.kind}`, { count: smoke.left })
            : t(`tastings.stockUpdate.${cellQuestion.choice}`)}
          isPending={updateInventory.isPending}
          // Back to "Mettre à jour le stock ?": the stock may still be left alone.
          onClose={() => setCellQuestion(null)}
          onConfirm={(answer) => { void handleStockChoice(cellQuestion.choice, answer); }}
        />
      )}

      <DiscardChangesDialog
        isOpen={guard.isConfirmOpen}
        onCancel={guard.cancelDiscard}
        onConfirm={guard.confirmDiscard}
      />
    </>
  );
}
