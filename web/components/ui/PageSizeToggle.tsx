'use client';
import { Button, ButtonGroup } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { PAGE_SIZE_OPTIONS, PageSizeOption } from '@/hooks/usePageSize';

interface PageSizeToggleProps {
  value: PageSizeOption;
  onChange: (size: PageSizeOption) => void;
}

export function PageSizeToggle({ value, onChange }: PageSizeToggleProps) {
  const { t } = useTranslation();
  return (
    <ButtonGroup size="sm" variant="flat">
      {PAGE_SIZE_OPTIONS.map((size) => (
        <Button
          key={size}
          color={value === size ? 'primary' : 'default'}
          variant={value === size ? 'flat' : 'light'}
          onPress={() => onChange(size)}
          aria-label={t('inventory.perPage', { count: size })}
          className="min-w-[34px] px-2"
        >
          {size}
        </Button>
      ))}
    </ButtonGroup>
  );
}
