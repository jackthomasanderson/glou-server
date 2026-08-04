'use client';
import React, { useEffect } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input,
} from '@heroui/react';
import { useForm, Controller } from 'react-hook-form';
import { CollectionFormValues, Collection } from '@/lib/collections/types';
import { useTranslation } from 'react-i18next';

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

const PRESET_ICONS = [
  '📦', '⭐', '🎁', '🍷', '🥃', '🌿', '🏆', '💎',
  '🍾', '🫙', '🧴', '🪣', '🍶', '🥂', '🍸', '🧉',
  '🌹', '🌺', '🌸', '🍁', '🍂', '🌾', '🪴', '🌊',
  '🏅', '🥇', '🎖️', '🪙', '💰', '🔑', '🗝️', '🔮',
  '📋', '🗂️', '📁', '🏷️', '🔖', '📌', '✨', '🎯',
];

interface CollectionFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: CollectionFormValues) => Promise<void>;
  initial?: Partial<Collection>;
  isLoading?: boolean;
}

export function CollectionForm({ open, onClose, onSubmit, initial, isLoading }: CollectionFormProps) {
  const { t } = useTranslation();
  const { control, handleSubmit, reset, watch, setValue } = useForm<CollectionFormValues>({
    defaultValues: { name: '', color: '#6366f1', icon: '' },
  });

  const selectedColor = watch('color');
  const selectedIcon = watch('icon');

  useEffect(() => {
    if (open) {
      reset({
        name: initial?.name ?? '',
        color: initial?.color ?? '#6366f1',
        icon: initial?.icon ?? '',
      });
    }
  }, [open, initial, reset]);

  const handleClose = () => {
    if (!isLoading) onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      size="sm"
      radius="lg"
      backdrop="opaque"
      placement="center"
    >
      <ModalContent>
        {(onModalClose) => (
          <form onSubmit={handleSubmit(onSubmit)}>
            <ModalHeader>
              {initial?.id ? t('collections.edit') : t('collections.create')}
            </ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Controller
                name="name"
                control={control}
                rules={{ required: true, minLength: 1, maxLength: 100 }}
                render={({ field, fieldState }) => (
                  <Input
                    {...field}
                    label={t('collections.fields.name')}
                    autoFocus
                    isInvalid={!!fieldState.error}
                    errorMessage={fieldState.error ? t('collections.errors.nameRequired') : undefined}
                    variant="bordered"
                  />
                )}
              />

              <div>
                <p className="text-xs text-default-400 mb-1.5">{t('collections.fields.color')}</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      aria-label={color}
                      onClick={() => setValue('color', color)}
                      className="w-7 h-7 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus"
                      style={{
                        backgroundColor: color,
                        border: selectedColor === color
                          ? '3px solid #000'
                          : '2px solid transparent',
                        outline: selectedColor === color ? '2px solid #fff' : undefined,
                        outlineOffset: '-4px',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-default-400 mb-1.5">{t('collections.fields.icon')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setValue('icon', selectedIcon === icon ? '' : icon)}
                      className={[
                        'w-9 h-9 flex items-center justify-center text-xl rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus',
                        selectedIcon === icon
                          ? 'bg-primary/20 border-2 border-primary'
                          : 'bg-default-100 border-2 border-transparent hover:bg-default-200',
                      ].join(' ')}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
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
  );
}
