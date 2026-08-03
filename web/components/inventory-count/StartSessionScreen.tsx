'use client';
import React, { useState } from 'react';
import {
  Card, CardHeader, CardBody, CardFooter, Button, Input, Select, SelectItem, Tabs, Tab,
} from '@heroui/react';
import { ClipboardCheck, Warehouse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCellars } from '@/hooks/useCellars';
import { useStartCountSession } from '@/hooks/useInventoryCount';

type ScopeMode = 'cellar' | 'custom';

function mapStartError(message: string): string {
  if (message === 'SESSION_ALREADY_IN_PROGRESS') return 'inventoryCount.start.errorConflict';
  if (message === 'CELLAR_NOT_FOUND') return 'inventoryCount.start.errorCellarNotFound';
  return 'status.error';
}

export function StartSessionScreen() {
  const { t } = useTranslation();
  const { data: cellars } = useCellars();
  const startMutation = useStartCountSession();

  const [mode, setMode] = useState<ScopeMode>('cellar');
  const [cellarId, setCellarId] = useState<string>('');
  const [customLabel, setCustomLabel] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const isValid = mode === 'cellar' ? !!cellarId : customLabel.trim().length > 0;

  const handleStart = async () => {
    setErrorKey(null);
    try {
      if (mode === 'cellar') {
        if (!cellarId) return;
        const cellar = cellars?.find((c) => c.id === cellarId);
        await startMutation.mutateAsync({ scopeLabel: cellar?.name ?? '', cellarId });
      } else {
        if (!customLabel.trim()) return;
        await startMutation.mutateAsync({ scopeLabel: customLabel.trim(), cellarId: null });
      }
    } catch (err) {
      setErrorKey(mapStartError(err instanceof Error ? err.message : ''));
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <Card radius="lg" shadow="sm">
        <CardHeader className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-primary" />
          <span className="text-lg font-bold">{t('inventoryCount.start.title')}</span>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-sm text-foreground-500">{t('inventoryCount.start.description')}</p>

          <Tabs
            selectedKey={mode}
            onSelectionChange={(key) => setMode(key as ScopeMode)}
            variant="solid"
            color="default"
            size="sm"
            fullWidth
            aria-label={t('inventoryCount.start.scopeModeAria')}
          >
            <Tab key="cellar" title={t('inventoryCount.start.modeCellar')} />
            <Tab key="custom" title={t('inventoryCount.start.modeCustom')} />
          </Tabs>

          {mode === 'cellar' ? (
            (cellars?.length ?? 0) > 0 ? (
              <Select
                label={t('inventoryCount.start.cellarLabel')}
                placeholder={t('inventoryCount.start.cellarPlaceholder')}
                variant="bordered"
                labelPlacement="outside"
                selectedKeys={cellarId ? [cellarId] : []}
                onSelectionChange={(keys) => setCellarId((Array.from(keys)[0] as string) ?? '')}
                isRequired
              >
                {(cellars ?? []).map((c) => (
                  <SelectItem key={c.id} startContent={<Warehouse size={14} />}>
                    {c.name}
                  </SelectItem>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-foreground-400">{t('inventoryCount.start.noCellars')}</p>
            )
          ) : (
            <Input
              label={t('inventoryCount.start.customLabel')}
              placeholder={t('inventoryCount.start.customPlaceholder')}
              variant="bordered"
              labelPlacement="outside"
              value={customLabel}
              onValueChange={setCustomLabel}
              isRequired
              description={t('inventoryCount.start.customHint')}
            />
          )}

          {errorKey && (
            <div className="rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-danger-700 text-sm">
              {t(errorKey)}
            </div>
          )}
        </CardBody>
        <CardFooter className="justify-end">
          <Button
            color="primary"
            variant="solid"
            isDisabled={!isValid}
            isLoading={startMutation.isPending}
            onPress={handleStart}
          >
            {t('inventoryCount.start.submit')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
