'use client';
import { BottleDashboard } from '@/components/bottles/BottleDashboard';
import frMessages from '@/locales/fr/common.json';
import enMessages from '@/locales/en/common.json';
import { useState, useCallback } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';

type Messages = typeof frMessages;

function createTranslator(messages: Messages) {
  return function t(key: string): string {
    const parts = key.split('.');
    let current: unknown = messages;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return key;
      current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : key;
  };
}

/**
 * Client wrapper pour /bottles — gère l'i18n côté client.
 * Nécessaire car les fonctions ne peuvent pas traverser la frontière
 * Server → Client Component dans l'App Router Next.js.
 */
export function BottlesClient() {
  const [locale] = useState<'fr' | 'en'>('fr');

  const t = useCallback(
    createTranslator(locale === 'fr' ? frMessages : enMessages),
    [locale]
  );

  return (
    <AuthGuard>
      <BottleDashboard t={t} />
    </AuthGuard>
  );
}
