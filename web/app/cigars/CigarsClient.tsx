'use client';
import { InventoryDashboard } from '@/components/inventory/InventoryDashboard';
import frMessages from '@/public/locales/fr/common.json';
import enMessages from '@/public/locales/en/common.json';
import { useState, useMemo, Suspense } from 'react';
import { MainLayout } from '@/components/ui/MainLayout';

type Messages = typeof frMessages;

function createTranslator(messages: Messages) {
  return function t(key: string, options?: Record<string, unknown>): string {
    let finalKey = key;
    if (options && typeof options.count === 'number' && options.count > 1) {
      finalKey = `${key}_plural`;
    }

    const parts = finalKey.split('.');
    let current: unknown = messages;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) break;
      current = (current as Record<string, unknown>)[part];
    }

    if (typeof current !== 'string' && finalKey !== key) {
      current = messages;
      for (const part of key.split('.')) {
        if (typeof current !== 'object' || current === null) return key;
        current = (current as Record<string, unknown>)[part];
      }
    }

    if (typeof current !== 'string') return key;

    let text = current;
    if (options) {
      Object.entries(options).forEach(([k, v]) => {
        text = text.replace(`{{${k}}}`, String(v));
      });
    }
    return text;
  };
}

export function CigarsClient() {
  const [locale] = useState<'fr' | 'en'>('fr');

  const t = useMemo(
    () => createTranslator(locale === 'fr' ? frMessages : enMessages),
    [locale]
  );

  return (
    <MainLayout>
      <Suspense fallback={null}>
        <InventoryDashboard t={t} lockedCategories={['cigar']} />
      </Suspense>
    </MainLayout>
  );
}
