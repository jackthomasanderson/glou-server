'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productKey } from '@shared/units';
import type { InventoryCategory } from '@shared/inventory';
import { productsClient, type KnownWineQuery } from '@/lib/products/client';
import type { Product } from '@/lib/products/types';

/** Typing pauses this long before the wine typed is looked up. */
export const KNOWN_WINE_DELAY_MS = 350;

/** What an add form holds of the wine's name, any of it still empty. */
export interface KnownWineFields {
  category?: InventoryCategory | null;
  producer?: string | null;
  name?: string | null;
  vintage?: number | null;
  format?: string | null;
}

/** The wine to look up once category, producer and name are typed; null before. */
function knownWineQuery(fields: KnownWineFields): KnownWineQuery | null {
  const producer = fields.producer?.trim();
  const name = fields.name?.trim();
  if (!fields.category || !producer || !name) return null;
  return { category: fields.category, producer, name, vintage: fields.vintage ?? null, format: fields.format?.trim() || null };
}

/**
 * #471 (FEAT-97): "Vous avez déjà ce vin" — the wines of the same name as
 * the one being typed (`productKey`: category, producer, name and vintage,
 * the vitola for a cigar), looked up once typing pauses. Empty while the
 * name is incomplete, while typing, and when nothing matches; a failed
 * lookup (offline) proposes nothing and never blocks the entry.
 */
export function useKnownWine(fields: KnownWineFields, enabled = true): Product[] {
  const query = enabled ? knownWineQuery(fields) : null;
  const key = query ? productKey(query) : null;
  const [settled, setSettled] = useState<{ key: string; query: KnownWineQuery } | null>(null);

  useEffect(() => {
    if (!query || !key) return;
    const timer = setTimeout(() => setSettled({ key, query }), KNOWN_WINE_DELAY_MS);
    return () => clearTimeout(timer);
    // `key` holds everything the query is compared on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = settled !== null && settled.key === key ? settled : null;
  const { data } = useQuery({
    // Under `inventory`: a bottle added or a wine created refreshes it too.
    queryKey: ['inventory', 'known-wine', current?.key],
    queryFn: () => productsClient.match(current!.query),
    enabled: current !== null,
    staleTime: 30_000,
    retry: false,
  });
  return current ? data ?? [] : [];
}
