'use client';
import React, { useEffect, useState } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Textarea, Select, SelectItem, Autocomplete, AutocompleteItem,
} from '@heroui/react';
import { Star } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { TastingFormValues, TastingReadiness } from '@/lib/tastings/types';
import { useCreateTasting, useUpdateTasting } from '@/hooks/useTastings';
import { useInventory, useUpdateInventoryItem } from '@/hooks/useInventory';
import { ServiceRecommendations } from './ServiceRecommendations';
import { useTranslation } from 'react-i18next';
import { InventoryItem } from '@/lib/inventory/types';

const CONTEXTS = ['solo', 'amis', 'restaurant', 'dégustation', 'cadeau'];
const READINESS_VALUES: TastingReadiness[] = ['TOO_YOUNG', 'PERFECT', 'PEAK', 'PAST'];

interface TastingFormProps {
  open: boolean;
  onClose: () => void;
  initialItemId?: string;
  editNote?: { id: string; values: TastingFormValues };
}

export function TastingForm({ open, onClose, initialItemId, editNote }: TastingFormProps) {
  const { t } = useTranslation();
  const { data: items } = useInventory();
  const createMutation = useCreateTasting();
  const updateMutation = useUpdateTasting();
  const updateInventory = useUpdateInventoryItem();
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [stockDialogItemId, setStockDialogItemId] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<TastingFormValues>({
    defaultValues: {
      itemId: initialItemId,
      rating: null,
      readiness: null,
      notes: '',
      context: '',
      foodPairing: '',
      tastedAt: new Date().toISOString().split('T')[0],
    },
  });

  const watchedItemId = watch('itemId');

  useEffect(() => {
    if (open) {
      if (editNote) {
        reset(editNote.values);
      } else {
        reset({
          itemId: initialItemId,
          rating: null,
          readiness: null,
          notes: '',
          context: '',
          foodPairing: '',
          tastedAt: new Date().toISOString().split('T')[0],
        });
      }
    }
  }, [open, initialItemId, editNote, reset]);

  useEffect(() => {
    if (watchedItemId && items) {
      const found = items.find((i) => i.id === watchedItemId) ?? null;
      setSelectedItem(found);
    } else {
      setSelectedItem(null);
    }
  }, [watchedItemId, items]);

  const handleClose = () => {
    if (!createMutation.isPending && !updateMutation.isPending) onClose();
  };

  const onSubmit = async (values: TastingFormValues) => {
    try {
      if (editNote) {
        await updateMutation.mutateAsync({ id: editNote.id, data: values });
        onClose();
      } else {
        const note = await createMutation.mutateAsync(values);
        if (note.itemId) {
          setStockDialogItemId(note.itemId);
        } else {
          onClose();
        }
      }
    } catch {
      // error displayed via mutation.error below
    }
  };

  const handleStockChoice = async (choice: 'opened' | 'consumed' | 'ignore') => {
    if (stockDialogItemId && choice !== 'ignore') {
      try {
        await updateInventory.mutateAsync({
          id: stockDialogItemId,
          patch: choice === 'consumed'
            ? { isOpened: true, fillLevel: 0 }
            : { isOpened: true, fillLevel: 50, openedAt: new Date().toISOString() },
        });
      } catch {
        // stock update failure is non-blocking
      }
    }
    setStockDialogItemId(null);
    onClose();
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const inventoryOptions = items?.filter((i) => !i.deletedAt) ?? [];
  const hasError = !!(createMutation.error || updateMutation.error);
  const showStockDialog = !!stockDialogItemId;

  return (
    <>
      <Modal
        isOpen={open && !showStockDialog}
        onClose={handleClose}
        size="md"
        radius="lg"
        backdrop="opaque"
        placement="center"
        scrollBehavior="inside"
        classNames={{ base: "max-h-[90dvh]" }}
      >
        <ModalContent>
          {() => (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
              <ModalHeader>
                {editNote ? t('tastings.edit') : t('tastings.create')}
              </ModalHeader>
              <ModalBody className="flex flex-col gap-4 min-h-0">
                {/* Error banner */}
                {hasError && (
                  <div className="rounded-lg bg-danger-50 border border-danger-200 text-danger px-3 py-2 text-sm">
                    {t('tastings.errors.saveFailed')}
                  </div>
                )}

                {/* Item selector */}
                <Controller
                  name="itemId"
                  control={control}
                  rules={{ required: t('tastings.errors.required') }}
                  render={({ field }) => (
                    <Autocomplete
                      label={`${t('tastings.fields.item')} *`}
                      isDisabled={!!initialItemId}
                      isInvalid={!!errors.itemId}
                      errorMessage={errors.itemId?.message}
                      defaultItems={inventoryOptions}
                      selectedKey={field.value ?? null}
                      onSelectionChange={(key) => field.onChange(key ?? '')}
                      variant="bordered"
                    >
                      {(item) => (
                        <AutocompleteItem key={item.id}>
                          {`${item.name} — ${item.producer}${item.vintage ? ` (${item.vintage})` : ''}`}
                        </AutocompleteItem>
                      )}
                    </Autocomplete>
                  )}
                />

                {/* Service recommendations */}
                {selectedItem && <ServiceRecommendations item={selectedItem} />}

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
                  <p className="text-xs text-default-400 mb-1">{t('tastings.fields.rating')}</p>
                  <Controller
                    name="rating"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Button
                            key={star}
                            isIconOnly
                            size="sm"
                            variant="light"
                            color={(field.value ?? 0) >= star ? 'warning' : 'default'}
                            radius="full"
                            type="button"
                            onClick={() => field.onChange(field.value === star ? null : star)}
                          >
                            <Star
                              size={18}
                              fill={(field.value ?? 0) >= star ? 'currentColor' : 'none'}
                            />
                          </Button>
                        ))}
                      </div>
                    )}
                  />
                </div>

                {/* Readiness */}
                <Controller
                  name="readiness"
                  control={control}
                  render={({ field }) => (
                    <Select
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
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  variant="light"
                  onPress={handleClose}
                  isDisabled={isLoading}
                >
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="primary"
                  variant="solid"
                  type="submit"
                  isLoading={isLoading}
                  isDisabled={isLoading}
                >
                  {isLoading ? t('actions.saving') : t('actions.save')}
                </Button>
              </ModalFooter>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* FEAT-77: Stock update suggestion after tasting creation */}
      <Modal
        isOpen={showStockDialog}
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
                <p className="text-sm text-default-500">
                  {t('tastings.stockUpdate.description')}
                </p>
              </ModalBody>
              <ModalFooter className="flex-col gap-2">
                <Button
                  color="warning"
                  variant="flat"
                  fullWidth
                  onPress={() => handleStockChoice('opened')}
                  isLoading={updateInventory.isPending}
                >
                  {t('tastings.stockUpdate.opened')}
                </Button>
                <Button
                  color="danger"
                  variant="flat"
                  fullWidth
                  onPress={() => handleStockChoice('consumed')}
                  isLoading={updateInventory.isPending}
                >
                  {t('tastings.stockUpdate.consumed')}
                </Button>
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
      </Modal>
    </>
  );
}
