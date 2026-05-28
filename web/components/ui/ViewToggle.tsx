'use client';
import React from 'react';
import { Button, ButtonGroup, Tooltip } from '@heroui/react';
import { LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ViewMode } from '@/hooks/useViewMode';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const { t } = useTranslation();
  return (
    <ButtonGroup size="sm" variant="flat">
      <Tooltip content={t('view.grid')} delay={500}>
        <Button
          isIconOnly
          color={value === 'grid' ? 'primary' : 'default'}
          variant={value === 'grid' ? 'flat' : 'light'}
          aria-label={t('view.grid')}
          onClick={() => onChange('grid')}
        >
          <LayoutGrid size={16} />
        </Button>
      </Tooltip>
      <Tooltip content={t('view.list')} delay={500}>
        <Button
          isIconOnly
          color={value === 'list' ? 'primary' : 'default'}
          variant={value === 'list' ? 'flat' : 'light'}
          aria-label={t('view.list')}
          onClick={() => onChange('list')}
        >
          <List size={16} />
        </Button>
      </Tooltip>
    </ButtonGroup>
  );
}
