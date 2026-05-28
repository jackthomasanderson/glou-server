'use client';
import React, { useState, useMemo } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Checkbox, Chip, Divider, Input, Select, SelectItem, Slider,
} from '@heroui/react';
import { Save, Trash2 } from 'lucide-react';
import { InventoryItem } from '@/lib/inventory/types';
import { useCellars } from '@/hooks/useCellars';
import { useBulkPresets, useCreateBulkPreset, useDeleteBulkPreset } from '@/hooks/useBulkPresets';

interface BulkActionDialogProps {
  open: boolean;
  onClose: () => void;
  selectedItems: InventoryItem[];
  onApply: (patch: Partial<InventoryItem>) => void;
  isSubmitting?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function BulkActionDialog({
  open,
  onClose,
  selectedItems,
  onApply,
  isSubmitting,
  t,
}: BulkActionDialogProps) {
  const { data: cellars } = useCellars();
  const { data: presets } = useBulkPresets();
  const createPresetMutation = useCreateBulkPreset();
  const deletePresetMutation = useDeleteBulkPreset();

  const [enabledFields, setEnabledFields] = useState({
    cellarId: false,
    location: false,
    collection: false,
    tags: false,
    isOpened: false,
    fillLevel: false,
  });

  const [values, setValues] = useState<Partial<InventoryItem>>({
    cellarId: null,
    location: '',
    collection: '',
    tags: [],
    isOpened: false,
    fillLevel: 100,
  });

  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  const toggleField = (field: keyof typeof enabledFields) => {
    setEnabledFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const setField = <K extends keyof Partial<InventoryItem>>(field: K, value: Partial<InventoryItem>[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const buildPatch = (): Partial<InventoryItem> => {
    const patch: Partial<InventoryItem> = {};
    if (enabledFields.cellarId) patch.cellarId = values.cellarId;
    if (enabledFields.location) patch.location = values.location;
    if (enabledFields.collection) patch.collection = values.collection;
    if (enabledFields.tags) patch.tags = values.tags;
    if (enabledFields.isOpened) patch.isOpened = values.isOpened;
    if (enabledFields.fillLevel) patch.fillLevel = values.fillLevel;
    return patch;
  };

  const handleApply = () => onApply(buildPatch());

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    createPresetMutation.mutate({ name: presetName, payload: buildPatch() }, {
      onSuccess: () => { setPresetName(''); setShowSavePreset(false); },
    });
  };

  const handleLoadPreset = (preset: { payload: Partial<InventoryItem> }) => {
    const p = preset.payload;
    const newEnabled = { ...enabledFields };
    const newValues = { ...values };
    if (p.cellarId !== undefined) { newEnabled.cellarId = true; newValues.cellarId = p.cellarId; }
    if (p.location !== undefined) { newEnabled.location = true; newValues.location = p.location; }
    if (p.collection !== undefined) { newEnabled.collection = true; newValues.collection = p.collection; }
    if (p.tags !== undefined) { newEnabled.tags = true; newValues.tags = p.tags; }
    if (p.isOpened !== undefined) { newEnabled.isOpened = true; newValues.isOpened = p.isOpened; }
    if (p.fillLevel !== undefined) { newEnabled.fillLevel = true; newValues.fillLevel = p.fillLevel; }
    setEnabledFields(newEnabled);
    setValues(newValues);
  };

  const summary = useMemo(() => {
    const fields = ['cellarId', 'location', 'collection', 'tags', 'isOpened', 'fillLevel'] as const;
    const result: Record<string, { before: string; after: string; changed: boolean }> = {};
    fields.forEach((field) => {
      if (!enabledFields[field]) { result[field] = { before: '', after: '', changed: false }; return; }
      const uniqueValues = new Set(selectedItems.map(b => {
        const val = b[field as keyof InventoryItem];
        if (field === 'tags' && Array.isArray(val)) return JSON.stringify([...val].sort());
        return val;
      }));
      let beforeText = '';
      if (uniqueValues.size > 1) {
        beforeText = t('bulk.mixed');
      } else {
        const val = Array.from(uniqueValues)[0];
        if (field === 'cellarId') beforeText = cellars?.find(c => c.id === val)?.name || t('inventory.noCellar');
        else if (field === 'isOpened') beforeText = val ? t('inventory.sealedStatus.opened') : t('inventory.sealedStatus.sealed');
        else if (field === 'tags') beforeText = (JSON.parse(val as string) as string[]).join(', ') || t('status.empty');
        else beforeText = (val as string) || t('status.empty');
      }
      const afterVal = values[field as keyof Partial<InventoryItem>];
      let afterText = '';
      if (field === 'cellarId') afterText = cellars?.find(c => c.id === afterVal)?.name || t('inventory.noCellar');
      else if (field === 'isOpened') afterText = afterVal ? t('inventory.sealedStatus.opened') : t('inventory.sealedStatus.sealed');
      else if (field === 'tags') afterText = (afterVal as string[]).join(', ') || t('status.empty');
      else afterText = (afterVal as string) || t('status.empty');
      result[field] = { before: beforeText, after: afterText, changed: true };
    });
    return result;
  }, [selectedItems, enabledFields, values, cellars, t]);

  const hasChanges = Object.values(enabledFields).some(v => v);

  return (
    <Modal isOpen={open} onClose={onClose} size="sm" radius="lg" backdrop="opaque" placement="center" scrollBehavior="inside">
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-0.5 pb-2">
              <span className="font-bold text-base">{t('bulk.title')}</span>
              <span className="text-xs text-default-500 font-normal">{t('bulk.subtitle', { count: selectedItems.length })}</span>
            </ModalHeader>

            <ModalBody className="gap-4 py-2">
              {/* Presets row */}
              {presets && presets.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">{t('bulk.presets')}</span>
                  <Select
                    aria-label={t('bulk.loadPreset')}
                    placeholder={t('bulk.loadPreset')}
                    variant="bordered"
                    size="sm"
                    className="max-w-[180px]"
                    onSelectionChange={(keys) => {
                      const id = Array.from(keys)[0] as string;
                      const p = presets.find(pr => pr.id === id);
                      if (p) handleLoadPreset(p);
                    }}
                  >
                    {presets.map(p => (
                      <SelectItem
                        key={p.id}
                        endContent={
                          <button
                            className="text-danger hover:opacity-70"
                            onClick={(e) => { e.stopPropagation(); deletePresetMutation.mutate(p.id); }}
                          >
                            <Trash2 size={13} />
                          </button>
                        }
                      >
                        {p.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              )}

              <Divider />

              <p className="text-xs font-semibold text-default-600">{t('bulk.fieldsToUpdate')}</p>

              <div className="flex flex-col gap-3">
                {/* Cellar */}
                <div>
                  <Checkbox
                    isSelected={enabledFields.cellarId}
                    onValueChange={() => toggleField('cellarId')}
                    size="sm"
                  >
                    <span className="text-sm">{t('nav.caves')}</span>
                  </Checkbox>
                  {enabledFields.cellarId && (
                    <Select
                      aria-label={t('nav.caves')}
                      label={t('nav.caves')}
                      variant="bordered"
                      size="sm"
                      className="mt-2"
                      selectedKeys={[values.cellarId ?? 'none']}
                      onSelectionChange={(keys) => setField('cellarId', Array.from(keys)[0] === 'none' ? null : Array.from(keys)[0] as string)}
                    >
                      <>
                        <SelectItem key="none"><em>{t('inventory.noCellar')}</em></SelectItem>
                        {(cellars ?? []).map(c => <SelectItem key={c.id}>{c.name}</SelectItem>)}
                      </>
                    </Select>
                  )}
                </div>

                {/* Location */}
                <div>
                  <Checkbox isSelected={enabledFields.location} onValueChange={() => toggleField('location')} size="sm">
                    <span className="text-sm">{t('inventory.fields.location')}</span>
                  </Checkbox>
                  {enabledFields.location && (
                    <Input
                      label={t('inventory.fields.location')}
                      variant="bordered"
                      size="sm"
                      className="mt-2"
                      value={values.location ?? ''}
                      onValueChange={(v) => setField('location', v)}
                    />
                  )}
                </div>

                {/* Collection */}
                <div>
                  <Checkbox isSelected={enabledFields.collection} onValueChange={() => toggleField('collection')} size="sm">
                    <span className="text-sm">{t('inventory.fields.collection')}</span>
                  </Checkbox>
                  {enabledFields.collection && (
                    <Input
                      label={t('inventory.fields.collection')}
                      variant="bordered"
                      size="sm"
                      className="mt-2"
                      value={values.collection ?? ''}
                      onValueChange={(v) => setField('collection', v)}
                    />
                  )}
                </div>

                {/* Tags */}
                <div>
                  <Checkbox isSelected={enabledFields.tags} onValueChange={() => toggleField('tags')} size="sm">
                    <span className="text-sm">{t('inventory.fields.tags')}</span>
                  </Checkbox>
                  {enabledFields.tags && (
                    <div className="mt-2">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {(values.tags ?? []).map((tag, i) => (
                          <Chip
                            key={i}
                            size="sm"
                            variant="bordered"
                            onClose={() => setField('tags', (values.tags ?? []).filter((_, idx) => idx !== i))}
                          >
                            {tag}
                          </Chip>
                        ))}
                      </div>
                      <Input
                        aria-label={t('inventory.fields.tags')}
                        placeholder={t('inventory.fields.tags') + '...'}
                        variant="bordered"
                        size="sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            setField('tags', [...(values.tags ?? []), e.currentTarget.value.trim()]);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* isOpened */}
                <div>
                  <Checkbox isSelected={enabledFields.isOpened} onValueChange={() => toggleField('isOpened')} size="sm">
                    <span className="text-sm">{t('inventory.fields.isOpened')}</span>
                  </Checkbox>
                  {enabledFields.isOpened && (
                    <Select
                      aria-label={t('inventory.fields.isOpened')}
                      label={t('inventory.fields.isOpened')}
                      variant="bordered"
                      size="sm"
                      className="mt-2"
                      selectedKeys={[values.isOpened ? 'opened' : 'sealed']}
                      onSelectionChange={(keys) => setField('isOpened', Array.from(keys)[0] === 'opened')}
                    >
                      <SelectItem key="sealed">{t('inventory.sealedStatus.sealed')}</SelectItem>
                      <SelectItem key="opened">{t('inventory.sealedStatus.opened')}</SelectItem>
                    </Select>
                  )}
                </div>

                {/* fillLevel */}
                <div>
                  <Checkbox isSelected={enabledFields.fillLevel} onValueChange={() => toggleField('fillLevel')} size="sm">
                    <span className="text-sm">{t('inventory.fields.fillLevel')}</span>
                  </Checkbox>
                  {enabledFields.fillLevel && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[100, 75, 50, 25, 0].map((v) => (
                        <Chip
                          key={v}
                          size="sm"
                          variant={values.fillLevel === v ? 'solid' : 'bordered'}
                          color={values.fillLevel === v ? 'primary' : 'default'}
                          className="cursor-pointer"
                          onClick={() => setField('fillLevel', v)}
                        >
                          {v}%
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Preview */}
              {hasChanges && (
                <div className="bg-default-100 rounded-xl p-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">{t('bulk.preview')}</p>
                  <div className="flex flex-col gap-1.5">
                    {Object.entries(summary).map(([field, data]) => {
                      if (!data.changed) return null;
                      return (
                        <div key={field} className="flex items-center gap-2 text-xs">
                          <span className="font-bold min-w-[80px] text-default-700">
                            {field === 'cellarId' ? t('nav.caves') : t(`inventory.fields.${field}`)}:
                          </span>
                          <span className="line-through text-default-400">{data.before}</span>
                          <span className="text-primary font-bold">→ {data.after}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save preset */}
              {hasChanges && (
                <div>
                  {!showSavePreset ? (
                    <Button
                      size="sm"
                      variant="light"
                      startContent={<Save size={14} />}
                      onPress={() => setShowSavePreset(true)}
                    >
                      {t('bulk.savePreset')}
                    </Button>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <Input
                        size="sm"
                        variant="bordered"
                        label={t('bulk.presetName')}
                        value={presetName}
                        onValueChange={setPresetName}
                        className="flex-1"
                      />
                      <Button size="sm" color="primary" onPress={handleSavePreset} isDisabled={!presetName.trim()}>
                        {t('actions.save')}
                      </Button>
                      <Button size="sm" variant="light" onPress={() => setShowSavePreset(false)}>
                        {t('actions.cancel')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>

            <ModalFooter className="gap-2 pt-2">
              <Button variant="light" onPress={onClose}>{t('actions.cancel')}</Button>
              <Button
                color="primary"
                onPress={handleApply}
                isDisabled={!hasChanges || isSubmitting}
                isLoading={isSubmitting}
              >
                {t('bulk.apply')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
