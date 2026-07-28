'use client';

import React from 'react';
import { Button } from '@heroui/react';

interface InventoryBulkBarProps {
  selectedCount: number;
  onBulkAction: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function InventoryBulkBar({ selectedCount, onBulkAction, t }: InventoryBulkBarProps) {
  return (
    <div className="fixed bottom-[80px] md:bottom-6 left-1/2 -translate-x-1/2 z-[1200] bg-content1 px-5 py-3 rounded-2xl shadow-xl flex gap-6 items-center min-w-[calc(100vw-32px)] sm:min-w-[320px]">
      <span className="font-bold text-primary">{t('bulk.selected', { count: selectedCount })}</span>
      <Button color="primary" onPress={onBulkAction}>
        {t('bulk.title')}
      </Button>
    </div>
  );
}
