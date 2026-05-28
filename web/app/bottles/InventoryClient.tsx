'use client';
import { InventoryDashboard } from '@/components/inventory/InventoryDashboard';
import frMessages from '@/public/locales/fr/common.json';
import enMessages from '@/public/locales/en/common.json';
import { useState, useMemo, Suspense } from 'react';

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

    // Fallback to non-plural if plural key missing
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

import { MainLayout } from '@/components/ui/MainLayout';

/**
 * Client wrapper pour /inventory — gère l'i18n côté client.
 * Nécessaire car les fonctions ne peuvent pas traverser la frontière
 * Server → Client Component dans l'App Router Next.js.
 */
export function InventoryClient() {
  const [locale] = useState<'fr' | 'en'>('fr');

  const t = useMemo(
    () => createTranslator(locale === 'fr' ? frMessages : enMessages),
    [locale]
  );

  return (
    <MainLayout>
      <Suspense fallback={null}>
        <InventoryDashboard t={t} lockedCategories={['wine', 'sparkling', 'spirit']} />
      </Suspense>
    </MainLayout>
  );
}
