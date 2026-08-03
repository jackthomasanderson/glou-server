'use client';
import React, { useState } from 'react';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Switch,
  Checkbox,
  Spinner,
} from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { ShareFormValues } from '@/lib/shares/types';
import { useCellars } from '@/hooks/useCellars';
import { useCollections } from '@/hooks/useCollections';

type DurationKey = '1d' | '7d' | '30d' | 'custom' | 'unlimited';

function computeExpiresAt(duration: DurationKey, customDate: string): string | null {
  if (duration === 'unlimited') return null;
  if (duration === 'custom') return customDate ? new Date(customDate).toISOString() : null;
  const days = duration === '1d' ? 1 : duration === '7d' ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

interface ShareFormProps {
  onSubmit: (values: ShareFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ShareForm({ onSubmit, onCancel, isLoading }: ShareFormProps) {
  const { t } = useTranslation();
  const { data: cellars, isLoading: loadingCellars } = useCellars();
  const { data: collections, isLoading: loadingCollections } = useCollections();

  const [label, setLabel] = useState('');
  const [inviteeName, setInviteeName] = useState('');
  const [duration, setDuration] = useState<DurationKey>('7d');
  const [customDate, setCustomDate] = useState('');
  const [hidePrices, setHidePrices] = useState(false);
  const [hideNotes, setHideNotes] = useState(false);
  const [scopeMode, setScopeMode] = useState<'all' | 'cellars' | 'collections'>('all');
  const [selectedCellarIds, setSelectedCellarIds] = useState<string[]>([]);
  const [writeCellarIds, setWriteCellarIds] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const values: ShareFormValues = {
      label: label.trim() || undefined,
      inviteeName: inviteeName.trim() || undefined,
      expiresAt: computeExpiresAt(duration, customDate),
      hidePrices,
      hideNotes,
      cellarIds: scopeMode === 'cellars' ? selectedCellarIds : [],
      writeCellarIds: scopeMode === 'cellars' ? writeCellarIds : [],
      collectionIds: scopeMode === 'collections' ? selectedCollectionIds : [],
    };
    await onSubmit(values);
  };

  const toggleCellar = (id: string) =>
    setSelectedCellarIds((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      // Keep writeCellarIds a strict subset of the selected cellars
      if (!next.includes(id)) {
        setWriteCellarIds((wPrev) => wPrev.filter((c) => c !== id));
      }
      return next;
    });

  const toggleCellarWrite = (id: string) =>
    setWriteCellarIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  const toggleCollection = (id: string) =>
    setSelectedCollectionIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Label */}
      <Input
        label={t('shares.fields.label')}
        placeholder={t('shares.fields.labelPlaceholder')}
        value={label}
        onValueChange={setLabel}
        variant="bordered"
        size="sm"
        radius="md"
        labelPlacement="outside"
      />

      {/* Invitee name */}
      <Input
        label={t('shares.fields.inviteeName')}
        placeholder={t('shares.fields.inviteeNamePlaceholder')}
        value={inviteeName}
        onValueChange={setInviteeName}
        variant="bordered"
        size="sm"
        radius="md"
        labelPlacement="outside"
      />

      {/* Duration */}
      <div className="flex flex-col gap-2">
        <Select
          label={t('shares.fields.duration')}
          selectedKeys={[duration]}
          onSelectionChange={(keys) => setDuration(Array.from(keys)[0] as DurationKey)}
          variant="bordered"
          size="sm"
          radius="md"
          labelPlacement="outside"
        >
          <SelectItem key="1d">{t('shares.fields.durations.1d')}</SelectItem>
          <SelectItem key="7d">{t('shares.fields.durations.7d')}</SelectItem>
          <SelectItem key="30d">{t('shares.fields.durations.30d')}</SelectItem>
          <SelectItem key="custom">{t('shares.fields.durations.custom')}</SelectItem>
          <SelectItem key="unlimited">{t('shares.fields.durations.unlimited')}</SelectItem>
        </Select>

        {duration === 'custom' && (
          <Input
            type="date"
            label={t('shares.fields.customDate')}
            value={customDate}
            onValueChange={setCustomDate}
            variant="bordered"
            size="sm"
            radius="md"
            labelPlacement="outside"
            isRequired
            min={new Date().toISOString().slice(0, 10)}
          />
        )}
      </div>

      {/* Scope */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-foreground-600">{t('shares.fields.scope')}</p>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scope"
              value="all"
              checked={scopeMode === 'all'}
              onChange={() => setScopeMode('all')}
              className="accent-primary"
            />
            <span className="text-sm">{t('shares.fields.allCellars')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scope"
              value="cellars"
              checked={scopeMode === 'cellars'}
              onChange={() => setScopeMode('cellars')}
              className="accent-primary"
            />
            <span className="text-sm">{t('shares.fields.selectCellars')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scope"
              value="collections"
              checked={scopeMode === 'collections'}
              onChange={() => setScopeMode('collections')}
              className="accent-primary"
            />
            <span className="text-sm">{t('shares.fields.selectCollections')}</span>
          </label>
        </div>

        {/* Cellar picker */}
        {scopeMode === 'cellars' && (
          <div className="mt-2 flex flex-col gap-2 max-h-48 overflow-y-auto border border-divider rounded-lg p-3">
            {loadingCellars ? (
              <Spinner size="sm" />
            ) : (
              (cellars ?? []).map((cellar) => {
                const isSelected = selectedCellarIds.includes(cellar.id);
                const canWrite = writeCellarIds.includes(cellar.id);
                return (
                  <div key={cellar.id} className="flex items-center justify-between gap-2">
                    <Checkbox
                      isSelected={isSelected}
                      onValueChange={() => toggleCellar(cellar.id)}
                      size="sm"
                    >
                      {cellar.name}
                    </Checkbox>
                    {isSelected && (
                      <Switch
                        isSelected={canWrite}
                        onValueChange={() => toggleCellarWrite(cellar.id)}
                        size="sm"
                        aria-label={t('shares.fields.cellarWriteAccessAria', { name: cellar.name })}
                      >
                        <span className="text-xs text-foreground-500">
                          {canWrite ? t('shares.fields.readWrite') : t('shares.fields.readOnly')}
                        </span>
                      </Switch>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Collection picker */}
        {scopeMode === 'collections' && (
          <div className="mt-2 flex flex-col gap-1 max-h-36 overflow-y-auto border border-divider rounded-lg p-3">
            {loadingCollections ? (
              <Spinner size="sm" />
            ) : (
              (collections ?? []).map((col) => (
                <Checkbox
                  key={col.id}
                  isSelected={selectedCollectionIds.includes(col.id)}
                  onValueChange={() => toggleCollection(col.id)}
                  size="sm"
                >
                  {col.name}
                </Checkbox>
              ))
            )}
          </div>
        )}
      </div>

      {/* Privacy toggles */}
      <div className="flex flex-col gap-3">
        <Switch isSelected={hidePrices} onValueChange={setHidePrices} size="sm">
          <span className="text-sm">{t('shares.hidePrices')}</span>
        </Switch>
        <Switch isSelected={hideNotes} onValueChange={setHideNotes} size="sm">
          <span className="text-sm">{t('shares.hideNotes')}</span>
        </Switch>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="light" size="sm" onPress={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button
          type="submit"
          color="primary"
          size="sm"
          isLoading={isLoading}
          isDisabled={
            isLoading ||
            (scopeMode === 'cellars' && selectedCellarIds.length === 0) ||
            (scopeMode === 'collections' && selectedCollectionIds.length === 0) ||
            (duration === 'custom' && !customDate)
          }
        >
          {t('actions.save')}
        </Button>
      </div>
    </form>
  );
}
