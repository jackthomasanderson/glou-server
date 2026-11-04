'use client';
import { Button } from '@heroui/react';
import { Plus } from 'lucide-react';
import { summarizeStock, unitKind } from '@shared/units';
import type { InventoryCategory } from '@shared/inventory';
import { useCellars } from '@/hooks/useCellars';
import { describeStock, wineName } from '@/lib/products/stock';
import type { Product } from '@/lib/products/types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** "vin", "spiritueux" or "cigare" in the banner's words (ux-ui.md §10.1). */
const nounOf = (category: InventoryCategory) =>
  category === 'cigar' ? 'Cigar' : category === 'spirit' ? 'Spirit' : '';

interface KnownWineBannerProps {
  /** The wines of the same name as the one typed (useKnownWine). */
  matches: readonly Product[];
  /** "Ajouter des bouteilles à ce vin": the reduced form, for that wine. */
  onAdd: (product: Product) => void;
  /** "C'est un autre vin": the full entry goes on, as a new wine. */
  onDistinct: () => void;
  isDisabled?: boolean;
  t: Translate;
}

/**
 * #471 (FEAT-97, ux-ui.md §10.4.1): "Vous avez déjà ce vin" — under the name
 * fields, never covering the entry: each wine of the same name with its
 * stock and cellars, then the two answers. Ignoring it blocks nothing.
 */
export function KnownWineBanner({ matches, onAdd, onDistinct, isDisabled = false, t }: KnownWineBannerProps) {
  const { data: cellars } = useCellars();
  if (matches.length === 0) return null;
  const noun = nounOf(matches[0].category);
  const cellarName = (id: string | null) =>
    (id && cellars?.find((cellar) => cellar.id === id)?.name) || t('knownWine.noCellar');

  return (
    <section
      data-testid="known-wine-banner"
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-50/10"
    >
      <p className="text-sm font-semibold text-foreground">{t(`knownWine.title${noun}`)}</p>
      <ul className="flex flex-col gap-2">
        {matches.map((product) => {
          const kind = unitKind(product.category);
          const stock = describeStock(product, t);
          const perCellar = [...new Set(product.items.map((item) => item.cellarId))]
            .map((cellarId) => ({
              name: cellarName(cellarId),
              units: summarizeStock(product.items.filter((item) => item.cellarId === cellarId), { kind }).units,
            }))
            .filter((cellar) => cellar.units > 0);
          const stockText = [
            stock.gone ? stock.spoken : t(kind === 'cigar' ? 'knownWine.stockCigars' : 'knownWine.stockBottles', { count: stock.units }),
            ...(perCellar.length > 0 ? [perCellar.map((cellar) => t('knownWine.inCellar', { cellar: cellar.name, count: cellar.units })).join(', ')] : []),
          ].join(' · ');
          const label = `${product.producer} · ${wineName(product)}`;
          return (
            <li key={product.id} data-testid="known-wine-match" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium truncate">{label}</p>
                <p data-testid="known-wine-stock" className="text-foreground-600">{stockText}</p>
              </div>
              <Button
                data-testid="known-wine-add"
                size="sm"
                color="primary"
                startContent={<Plus size={15} />}
                className="shrink-0"
                isDisabled={isDisabled}
                // Several wines of the same name: each button says which one.
                aria-label={t('knownWine.addAria', { action: t(`knownWine.add${noun}`), wine: label, stock: stockText })}
                onPress={() => onAdd(product)}
              >
                {t(`knownWine.add${noun}`)}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button
        data-testid="known-wine-distinct"
        size="sm"
        variant="bordered"
        className="self-start"
        isDisabled={isDisabled}
        onPress={onDistinct}
      >
        {t(`knownWine.distinct${noun}`)}
      </Button>
    </section>
  );
}
